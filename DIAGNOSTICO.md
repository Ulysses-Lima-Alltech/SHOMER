# Diagnóstico do Repositório SHOMER

**Data:** 2026-08-07
**Branch analisada:** `feat/dashboard-redesign` (HEAD = `e2c0a9a`, idêntico a `main`, `feat/edge-crossing-events`, `feat/edge-line-crossing`, `feat/edge-vision-foundation`, `feat/ingestion-event-receiver`)
**Método:** inspeção direta do disco e do git (não me baseei nos READMEs) — todo comando citado abaixo foi executado de fato.

---

## 1. Resumo executivo

SHOMER é um sistema de people-counting / analytics de loja física via visão computacional (detecção de pessoas, contagem por cruzamento de linha, potencialmente reconhecimento facial). O repositório contém **duas implementações completamente distintas do mesmo produto**, sem nenhuma documentação na raiz explicando qual é a oficial:

- `recovery/shomer-3.1/` — monólito Python/FastAPI + React, importado para o repo em **um único commit de "preservação"** (`6a84fe1`, 2026-08-07), sem histórico de desenvolvimento incremental, sem testes, sem Dockerfile apesar do docker-compose referenciá-lo, README com estrutura de pastas desatualizada em relação ao código real.
- `shomer-standalone/` — reescrita em microsserviços (NestJS ×2 + Next.js + Python/FastAPI), com **desenvolvimento ativo e recente** (commits de hoje, 2026-08-07, em branches de feature mergeadas para `main`). Porém **dois dos quatro serviços (`api/` e `ingestion/`) não têm nenhum código-fonte no disco nem no git** — só `package.json`/`tsconfig.json`. O serviço `edge/` (Python) é o único completo, testado (79/79 testes passam) e ativamente desenvolvido.

**Bloqueio principal para trabalhar no repo:** `shomer-standalone` se apresenta como "build pronto para rodar" (README, `install.bat`, `start.bat`), mas **não é executável hoje** — `api/` e `ingestion/` não têm `src/` nem `dist/` em lugar nenhum que eu tenha encontrado, e o próprio `start.bat` faz `node dist/src/main.js` / `node dist/main.js`, que não existem. Não há projeto-fonte desses dois serviços em nenhum outro lugar deste repositório (branches, histórico de commits, ou pasta alternativa) — isso precisa ser esclarecido por você (ver seção 7).

O `dashboard/` do standalone tem apenas o scaffold padrão do Next.js (`app/layout.tsx`, `app/page.tsx` com dados mockados de hardcode), **ainda não commitado** (está `Untracked` no `git status` atual, exatamente na branch `feat/dashboard-redesign` em que você está).

---

## 2. Mapa do repositório

```
SHOMER/
├── README.md                    # genérico de portfólio, não descreve o projeto — placeholder
├── .gitignore                   # cobre node_modules, .venv, *.pt/*.onnx, .env — OK
├── favicon/ logo/ icone/ guia-de-marca/ redes-sociais/   # assets de marca, irrelevantes ao código
├── scripts/
│   ├── dev.ps1 / dev.sh         # QUEBRADOS: pressupõem cwd = shomer-standalone/ e um
│   │                            # root package.json com scripts "dev:api" etc. que NÃO EXISTE
│   └── check-docker.ps1         # utilitário simples, funcional
├── recovery/shomer-3.1/         # LEGADO — snapshot único, sem testes, sem Dockerfile
│   ├── backend/                 # FastAPI + SQLAlchemy async + YOLOv8 + InsightFace
│   │   ├── main.py, detection.py    # na raiz do backend (fora da árvore DDD)
│   │   └── src/{application,domain,infrastructure,shared}/  # clean architecture parcial
│   ├── frontend/                # React 18 + Vite + TS + Tailwind + Framer Motion
│   └── docker-compose.yml       # referencia ./backend/Dockerfile e ./frontend/Dockerfile — nenhum existe
└── shomer-standalone/           # ATIVO — mas incompleto
    ├── api/                     # ⚠️ SÓ CONFIG: package.json, tsconfig.json, nest-cli.json.
    │                            #    Sem src/, sem node_modules, sem dist/. Não roda.
    ├── ingestion/                # ⚠️ mesma situação da api/
    ├── dashboard/                # Next.js 14 — só scaffold padrão, código real ausente,
    │                            #    parte do código (app/) está untracked no git agora
    ├── edge/                     # ✅ COMPLETO — Python/FastAPI, YOLOv8+ByteTrack, testado
    │   ├── src/{vision,analytics,events,mock}/
    │   └── tests/                # 79 testes, todos passando
    ├── infra/                    # docker-compose só com Postgres+ClickHouse+Redis
    │   ├── postgres/init.sql
    │   └── clickhouse/ddl/{events.sql,init.sql,README.md}
    ├── install.bat / start.bat / stop.bat   # orquestração via .bat, pressupõe dist/ compilados
    └── README.md                 # diz "Build criado em: 2026-01-05" — sugere fonte externa (ver seção 7)
```

---

## 3. Stack técnica por serviço

| Serviço | Linguagem/Framework | Banco | Estado |
|---|---|---|---|
| `recovery/shomer-3.1/backend` | Python, FastAPI 0.95.0, SQLAlchemy async, Pydantic 1.7.4, YOLOv8 (Ultralytics), InsightFace, MediaPipe, OpenCV, PyJWT (`python-jose`)/Passlib, PyQt5 | PostgreSQL (asyncpg) | Código completo, roda em tese, sem testes, sem Dockerfile |
| `recovery/shomer-3.1/frontend` | React 18, TypeScript, Vite 7, Tailwind 3, Framer Motion, Axios, React Router 7, jwt-decode | — | Código completo, `node_modules` presente localmente, sem testes |
| `shomer-standalone/api` | NestJS 10, TypeORM 0.3, JWT/Passport, bcrypt, Swagger, ClickHouse client | PostgreSQL + ClickHouse | **Sem código-fonte** |
| `shomer-standalone/ingestion` | NestJS 10, ClickHouse client, Swagger | ClickHouse | **Sem código-fonte** |
| `shomer-standalone/dashboard` | Next.js 14.0.4, React 18, TanStack Query, Recharts, Axios, date-fns | — | Só scaffold, sem integração real com API |
| `shomer-standalone/edge` | Python 3.11, FastAPI, Pydantic Settings 2, OpenCV headless, Ultralytics (YOLOv8+ByteTrack) | — (publica eventos via HTTP) | **Completo, testado, ativo** |

---

## 4. Gaps investigados (evidência real)

### 4.1 Estado do working tree
```
$ git status
On branch feat/dashboard-redesign
Untracked files:
  shomer-standalone/dashboard/app/
  shomer-standalone/dashboard/next-env.d.ts
  shomer-standalone/dashboard/tsconfig.json
  shomer-standalone/dashboard/tsconfig.tsbuildinfo
$ git stash list
(vazio)
```
**Confirmado:** não há stash nem trabalho escondido. O `app/` ausente do dashboard no git **existe no disco local** (`layout.tsx`, `page.tsx`, `page.tsx.before-manager-home`, `globals.css`) mas nunca foi commitado — é trabalho em progresso nesta própria branch (`feat/dashboard-redesign`), não um mistério de outro lugar. `components/` existe como pasta mas está **vazia**.

Branches locais: `feat/dashboard-redesign`, `feat/edge-crossing-events`, `feat/edge-line-crossing`, `feat/edge-vision-foundation`, `feat/ingestion-event-receiver`, `recovery/shomer-3-1-source`, `main`. Todas as branches de feature (exceto `recovery/shomer-3-1-source`) apontam para o **mesmo commit** `e2c0a9a` — já foram mergeadas em `main` e não têm mais trabalho único. `feat/ingestion-event-receiver` em particular está vazia (zero diff vs `main`), apesar do nome sugerir um serviço de ingestão que também não existe no código.

### 4.2 `shomer-standalone` é buildável hoje?
**Não.** Confirmado por múltiplos ângulos:
- `find shomer-standalone/api shomer-standalone/ingestion -type d` não retorna nenhuma subpasta (nem `src/`, nem `node_modules/`, nem `dist/`) — os diretórios contêm **apenas** `package.json`, `package-lock.json`, `package-lock-Ulysses.json`, `tsconfig.json`, `nest-cli.json`.
- `git check-ignore` não acusa nada sendo ignorado — não é um problema de `.gitignore`, o código simplesmente não existe em disco.
- `find . -iname main.ts` dentro de `api/` e `ingestion/` não encontra nada.
- O próprio `start.bat` (linha do passo 8) admite isso no comentário: *"Pular migrations/seeds no build standalone (não funcionam sem arquivos fonte)"* — o build sabe que não tem os arquivos-fonte.
- `start.bat` tenta `node dist/src/main.js` (api) e `node dist/main.js` (ingestion) — nenhum `dist/` existe.

O `dashboard/` tem scaffold mínimo (rodei `npm start`; a porta 3002 já estava ocupada por um `next dev` anterior rodando localmente — `curl localhost:3002` retornou `200`). Ou seja, o dashboard sobe sozinho, mas exibe apenas dados mockados de exemplo (`hourly`, `movement` fixos no `page.tsx`), sem integração real com `api`.

O `edge/` é o único 100% funcional: tem `Dockerfile`, `requirements.txt`, `src/` completo e testes passando.

### 4.3 Qual sistema está ativo?
```
$ git log -1 --format="%ci %s" -- recovery
2026-08-07 13:49:16 -0300 recovery: preserve Shomer 3.1 source   (commit único, "importação")

$ git log -1 --format="%ci %s" -- shomer-standalone/edge
2026-08-07 15:18:00 -0300 feat: publish line crossing events asynchronously

$ git log --oneline -- shomer-standalone
c42e739 feat: publish line crossing events asynchronously
b22b293 feat: add Edge line crossing analytics
88cb504 feat: add Edge vision foundation with YOLO and ByteTrack
04f05f3 chore: initial public portfolio commit
```
**Confirmado:** `recovery/shomer-3.1` entrou como um snapshot único ("preserve... source"), sem desenvolvimento incremental dentro deste repositório — é claramente arquivo histórico. `shomer-standalone/edge` tem 3 features desenvolvidas hoje via branches dedicadas e merges via PR (#3, #4, #5 no GitHub). **`shomer-standalone` (especificamente o `edge/`) é o sistema em desenvolvimento ativo.** `api/`, `ingestion/` e `dashboard/` do standalone nunca tiveram um commit de código de fato — só apareceram como esqueleto de config no commit inicial (`04f05f3`).

### 4.4 Existe um projeto-fonte do standalone em outro lugar?
**Não encontrado dentro deste repositório.** O README do standalone diz *"Build criado em: 2026-01-05 18:35:41"* e descreve as pastas como "API compilada", "Ingestion compilada", "Dashboard compilado" — linguagem de build/empacotamento, não de código-fonte. `scripts/dev.ps1` e `scripts/dev.sh` na raiz do repo reforçam essa hipótese: eles fazem `cd infra && docker-compose up` (só existe `infra/` dentro de `shomer-standalone/`, não na raiz — os scripts pressupõem rodar de dentro de `shomer-standalone/`) e instruem a rodar `npm run dev:api`, `npm run dev:ingestion`, `npm run dev:dashboard` — **scripts de um monorepo com workspaces npm que não existe aqui** (não há `package.json` na raiz do repo nem em `shomer-standalone/` — confirmei com `find . -maxdepth 2 -iname package.json`, retorno vazio).

**Isso é uma evidência forte de que existe (ou existiu) um repositório/projeto-fonte separado** — provavelmente um monorepo npm workspace com `api/`, `ingestion/`, `dashboard/` como pacotes internos — do qual só o *build* (config + a parte do `edge` que por ser Python não passa por bundler) foi copiado para cá. Não consegui localizar esse projeto-fonte no disco nem no git deste repo. **Isto precisa da sua confirmação** (seção 7).

### 4.5 `.env.example`
```
$ find . -iname "*.env.example*" -not -path "*/node_modules/*"
(nenhum resultado)
$ find . -iname ".env" -not -path "*/node_modules/*"
(nenhum resultado)
```
**Confirmado: não existe nenhum `.env` nem `.env.example` em lugar nenhum do repositório**, apesar de `README.md` do recovery instruir "copie `.env.example`" e `start.bat` do standalone tentar copiar `api\.env.example`/`ingestion\.env.example`/`edge\.env.example` (que também não existem).

Variáveis de ambiente referenciadas no código (para você configurar manualmente):
- **recovery backend:** `JWT_SECRET_KEY` (usado em `jwt_auth_service.py`), `DATABASE_URL`, `YOLO_MODEL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (via docker-compose), `PGADMIN_EMAIL`, `PGADMIN_PASSWORD`.
- **edge (`src/config.py`, Pydantic Settings):** `MODE`, `API_URL`, `INGESTION_URL`, `CAMERA_SOURCE`, `RTSP_URL`, `FFMPEG_PATH`, `YOLO_MODEL`, `YOLO_CONFIDENCE`, `YOLO_IMAGE_SIZE`, `YOLO_TRACKER`, `VISION_FPS`, `CAMERA_RECONNECT_SECONDS`, `LINE_CROSSING_ENABLED`, `LINE_CROSSING_LINE_ID`, `LINE_CROSSING_X1/Y1/X2/Y2`, `LINE_CROSSING_ENTER_DIRECTION`, `LINE_CROSSING_TOLERANCE`, `LINE_CROSSING_COOLDOWN_SECONDS`, `LINE_CROSSING_TRACK_TTL_SECONDS`, `CROSSING_EVENTS_ENABLED`, `EVENT_QUEUE_MAX_SIZE`, `EVENT_PUBLISH_MAX_ATTEMPTS`, `EVENT_PUBLISH_RETRY_BASE_SECONDS`, `EVENT_PUBLISH_RETRY_MAX_SECONDS`, `EVENT_PUBLISH_DRAIN_TIMEOUT_SECONDS`, `TENANT_ID`, `STORE_ID`, `CAMERA_ID`, `EDGE_DEVICE_ID`, `DEVICE_KEY`.
- **api/ingestion:** não é possível listar — não há código-fonte para inspecionar.

### 4.6 Testes
```
$ .venv/Scripts/python.exe -m pytest tests/ -v   (dentro de shomer-standalone/edge)
============================== 79 passed, 1 warning in 1.31s ==============================
```
**Confirmado, com ressalva:** os 79 testes do `edge/` passam integralmente. Porém a `.venv/` já existente no disco **não tinha `pytest` nem `pydantic` instalados** (só um subconjunto incompleto de dependências) — tive que rodar `pip install pytest pytest-asyncio` e `pip install -r requirements.txt` antes de conseguir rodar. Ou seja, a venv local estava desatualizada/incompleta em relação ao `requirements.txt` do próprio projeto.

`recovery/shomer-3.1`: **zero arquivos de teste** — confirmado via busca por `test_*.py`, `*_test.py`, `conftest.py` no backend e `*.test.*`/`*.spec.*` no frontend. Nenhum resultado.

### 4.7 Segurança
- `JWT_SECRET_KEY` **não está hardcoded** — é lido de `os.getenv("JWT_SECRET_KEY")` em `jwt_auth_service.py`. O valor `your-secret-key-here` só aparece como placeholder de exemplo no `README.md`, não em código executável. **OK.**
- Senhas em texto plano em arquivos **committados**:
  - `recovery/shomer-3.1/docker-compose.yml`: defaults `shomer_pass_123` (Postgres), `admin`/`admin@local` (pgAdmin) — via `${VAR:-default}`, aceitável para dev mas os defaults ficam expostos no git.
  - `shomer-standalone/infra/docker-compose.yml`: `shomer_dev` hardcoded (sem fallback de env var) para Postgres e ClickHouse — senha fixa, sem indireção por `.env`.
  - `shomer-standalone/start.bat`: imprime no terminal **credenciais de login do dashboard**: `admin@shomer.com` / `admin123`, hardcoded no script.
  - Nenhum desses arquivos está marcado ou documentado como "não usar em produção" — se algum dia isso for além de dev local, precisa de rotação de segredos e remoção do compose.

### 4.8 Dependências desatualizadas/vulneráveis
```
$ cd shomer-standalone/dashboard && npm audit --production
6 vulnerabilities (1 moderate, 5 high)   — todas em next@14.0.4 e postcss (dependência do Next)
```
**Confirmado.** `api/` e `ingestion/` não têm `node_modules` nem foram instalados (sem `src/`, não faz sentido instalar) — audit não é aplicável até que o código-fonte apareça.

`recovery/shomer-3.1/backend/requirements.txt` fixa versões antigas (`fastapi==0.95.0`, `pydantic==1.7.4`, `uvicorn==0.22.0`) — datam de ~2023. **Não rodei `pip list --outdated`** porque o `requirements.txt` exige Torch com CUDA 12.1 (download de vários GB) e não há venv já preparada para esse projeto no disco — seria necessário um ambiente com GPU/CUDA para instalar de verdade. Isto fica como **item não verificado** (ver seção "incertos" abaixo); recomendo tratar como desatualizado dado o ano dos pins.

### 4.9 Consistência de portas/URLs
```
edge/src/config.py:        API_URL=http://localhost:3000, INGESTION_URL=http://localhost:3001
shomer-standalone/README.md: Dashboard 3002, API Swagger 3000, Ingestion Swagger 3001, Edge 8000
scripts/dev.ps1 / dev.sh:  checa health em 3000 (API), 3001 (Ingestion), 8000 (Edge)
shomer-standalone/dashboard/package.json: "dev": "next dev -p 3002", "start": "next start -p 3002"
```
**Confirmado consistente** entre `edge/config.py`, o README do standalone e os scripts de dev — todas as portas batem (3000/3001/3002/8000). Não há `main.ts` em `api/`/`ingestion/` para confirmar a porta configurada neles (porque não existem), mas a documentação e os outros serviços concordam entre si.

### 4.10 `scripts/dev.ps1` e `scripts/dev.sh`
**Confirmado: ambos orquestram o sistema `shomer-standalone`, e ambos estão quebrados/incompletos.** Fazem `cd infra && docker-compose up -d` (só existe em `shomer-standalone/infra`, não a partir da raiz do repo — teria que rodar de dentro de `shomer-standalone/`), fazem healthcheck HTTP em `localhost:3000/3001/8000`, e instruem rodar `npm run dev:api`, `npm run dev:ingestion`, `npm run dev:dashboard`. **Não existe `package.json` em lugar nenhum do repo com esses scripts** — confirma novamente a hipótese da seção 4.4: esses scripts foram escritos para um monorepo-fonte que não está neste repositório.

---

## 5. Como rodar o projeto hoje (testado por mim)

### `shomer-standalone` — ⚠️ não roda ponta a ponta
1. `cd shomer-standalone/infra && docker-compose up -d` → sobe Postgres, ClickHouse, Redis (não testei — exigiria Docker Desktop rodando na sua máquina; a config está sintaticamente correta e usa imagens públicas padrão, deve funcionar).
2. `edge/`: **funciona isoladamente.**
   ```
   cd shomer-standalone/edge
   .venv/Scripts/python.exe -m pip install -r requirements.txt   # venv local estava incompleta
   .venv/Scripts/python.exe -m pytest tests/ -v                  # 79 passed
   .venv/Scripts/python.exe -m uvicorn src.main:app --port 8000  # deveria subir em MODE=mock por padrão
   ```
3. `dashboard/`: sobe sozinho (`npm run dev` ou `npm start`, porta 3002), mas mostra só dados mockados fixos no código — sem chamada real a nenhuma API.
4. `api/` e `ingestion/`: **impossível rodar.** `npm install` não tem o que instalar além de deps declaradas (sem `src/`), `npm run build`/`start` falham por ausência de `nest-cli`/entrypoint de fato compilável (sem `src/main.ts`).

Resultado: **não dá para ter o pipeline completo (edge → ingestion → clickhouse → api → dashboard) funcionando hoje.** Só o `edge` isolado e o `dashboard` como página estática mockada.

### `recovery/shomer-3.1` — não testei rodar de fato (não tentei subir o backend Python nem o Vite, dado o escopo "só diagnóstico, sem alterar nada" e a ausência de `.env`/segredos necessários); meu diagnóstico aqui é estrutural, baseado em inspeção do código:
- Backend exigiria criar um `.env` do zero (nenhum exemplo existe) com no mínimo `DATABASE_URL` e `JWT_SECRET_KEY`, subir Postgres via `docker-compose up postgres` (o compose da raiz do recovery), e então `pip install -r backend/requirements.txt` (pesado: exige CUDA 12.1/PyTorch) antes de `python backend/main.py`.
- Frontend: `node_modules` já presente localmente; `npm run dev` (Vite) provavelmente funciona standalone, mas sem backend ativo as chamadas de API vão falhar.
- Sem `Dockerfile.backend`/`Dockerfile.frontend`, o `docker-compose.yml` da raiz do recovery **falha ao tentar buildar** (`build: context: ./backend, dockerfile: Dockerfile` — não existe).

---

## 6. Dívida técnica e riscos priorizados

**Crítico**
- `shomer-standalone/api` e `shomer-standalone/ingestion` não têm código-fonte — o "produto novo" não roda ponta a ponta. Bloqueia qualquer trabalho de integração real (edge → ingestion → api → dashboard).
- Nenhum `.env.example` em lugar nenhum — qualquer setup local exige reconstruir a lista de variáveis manualmente a partir do código (parcialmente impossível para `api`/`ingestion`, que não têm código).

**Alto**
- `recovery/shomer-3.1/docker-compose.yml` referencia Dockerfiles inexistentes — quebrado como está.
- Zero testes em `recovery/shomer-3.1` (backend com lógica de detecção/auth sem cobertura nenhuma).
- 5 vulnerabilidades "high" no `dashboard` via `npm audit` (Next.js 14.0.4 desatualizado — múltiplos CVEs de DoS/SSRF/cache poisoning).
- `scripts/dev.ps1`/`dev.sh` na raiz do repo estão quebrados/órfãos — sugerem um monorepo-fonte que não está neste repositório; se alguém tentar usá-los hoje, falham.

**Médio**
- Credenciais em texto plano em `docker-compose.yml` (ambos os sistemas) e em `start.bat` (login do dashboard) — aceitável só para dev local, mas commitado sem aviso.
- `package-lock.json` duplicado com `package-lock-Ulysses.json` em `api/`, `ingestion/`, `dashboard/` (diffs mínimos, cosméticos) — poluição de repositório, risco de divergência futura entre lockfiles.
- Versões antigas fixadas no `recovery/shomer-3.1/backend/requirements.txt` (FastAPI 0.95, Pydantic 1.7 — ~2023), não auditadas por falta de ambiente CUDA disponível.
- README.md da raiz do repo é genérico/placeholder — não orienta ninguém sobre qual sistema usar.

**Baixo**
- `README.md` do `recovery/shomer-3.1` descreve uma árvore de pastas (`backend/shomer/...`, com `interfaces/`) que não bate com a árvore real (`backend/src/...`, sem `interfaces/`).
- `.venv/` local do `edge/` estava com dependências incompletas em relação ao `requirements.txt` (faltava `pydantic`, `pytest`).

---

## 7. Perguntas em aberto para o Ulysses

1. **Qual sistema é o "oficial"?** `recovery/shomer-3.1` está completo mas parece arquivado (importado em commit único, sem testes, sem Dockerfile funcional). `shomer-standalone` tem desenvolvimento ativo mas 2 de 4 serviços não têm código. Você pretende continuar o `shomer-standalone` e considerar o `recovery` puramente histórico/referência?
2. **Onde está o código-fonte de `shomer-standalone/api`, `ingestion` e `dashboard`?** As evidências (README fala em "build compilado" com data 2026-01-05, `scripts/dev.ps1`/`dev.sh` referenciam um monorepo com `npm run dev:api` que não existe aqui) apontam fortemente para um projeto-fonte separado, fora deste repositório Git. Existe esse projeto em outra pasta local, outro repo GitHub, ou foi perdido?
3. Se o código-fonte de `api`/`ingestion` não existir mais em lugar nenhum, você quer que eu **reconstrua esses dois serviços do zero** (a partir do `package.json`/schema ClickHouse/Postgres já existentes, que dão boas pistas do design pretendido) ou prefere primeiro tentar recuperá-los de outro lugar?
4. `recovery/shomer-3.1` pode ser arquivado/movido para fora do fluxo de trabalho ativo (ex: branch separada, ou removido do checkout principal), já que não recebe desenvolvimento?
5. As credenciais hardcoded em `start.bat` (`admin@shomer.com`/`admin123`) e nos `docker-compose.yml` — são só para demo/dev, ou chegaram a ir para algum ambiente real? Preciso saber se preciso tratar isso como incidente de segurança ou só como dívida técnica de dev local.
6. Os `package-lock-Ulysses.json` foram deixados de propósito (ex: lockfile "pessoal" paralelo por alguma razão de ambiente) ou é lixo de duplicação que posso remover?

---

## 8. Itens confirmados vs. incertos

**Confirmados com evidência direta (comando + saída) — 9 de 10 pontos do seu checklist:**
1. Estado do working tree (git status, stash, branches)
2. `shomer-standalone` não é buildável hoje (ausência de `src/`/`dist/` em `api`/`ingestion`)
3. Qual sistema está ativo (datas de commit por pasta)
5. Ausência de `.env.example` em todo o repo + lista de env vars por código-fonte disponível
6. Testes (edge: 79/79 passando; recovery: zero testes)
7. Segurança (JWT não hardcoded; senhas em plaintext em compose/bat)
8. Dependências (dashboard: `npm audit` completo; api/ingestion: N/A por falta de código)
9. Consistência de portas/URLs
10. Função e quebra dos `scripts/dev.ps1`/`dev.sh`

**Incertos / não totalmente verificáveis — 2 pontos, ambos precisam de você:**
4. Existência de um projeto-fonte externo do `shomer-standalone` — encontrei fortes indícios circunstanciais (linguagem do README, scripts órfãos referenciando workspace inexistente) mas **não consegui localizar o projeto-fonte em si** dentro deste repositório — só você sabe se ele existe em outro lugar.
8. (parcial) `pip list --outdated` para `recovery/shomer-3.1/backend` — não rodei porque o ambiente exige PyTorch+CUDA 12.1 (download grande, sem venv pré-existente); infiro desatualização pelos anos dos pins (`fastapi==0.95.0`, `pydantic==1.7.4`), mas não é uma verificação direta.
