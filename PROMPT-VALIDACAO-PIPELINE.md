# Prompt para Claude Code (VSCode) — Validar o pipeline SHOMER de ponta a ponta

Cole o texto abaixo no Claude Code, com o repositório aberto no VSCode.

---

Acabei de construir, num sandbox sem Docker e com acesso de rede limitado (não consegui rodar `npm install` completo nem `docker-compose up`), o código que faltava no `shomer-standalone` para o pipeline funcionar de ponta a ponta: `edge` (mock) → `ingestion` → ClickHouse → `api` → `dashboard`. Preciso que você valide se isso realmente funciona no seu ambiente, que tem Docker e rede completos.

## O que foi construído (não existia antes)

- `shomer-standalone/ingestion/src/**` — serviço NestJS completo: `POST /events` (autenticado por `x-edge-device-id`/`x-device-key`), grava no ClickHouse.
- `shomer-standalone/api/src/**` — serviço NestJS completo: `POST /auth/login`, `GET /auth/me` (JWT + Postgres/TypeORM), `GET /stats/overview`, `GET /stats/hourly`, `GET /stats/movement` (lendo do ClickHouse), `GET /health`, migration inicial da tabela `users`, seed do usuário admin.
- `shomer-standalone/dashboard/lib/api.ts` e `app/login/page.tsx` — novos. `app/page.tsx` foi reescrito: removi os números hardcoded e liguei a UI aos endpoints reais da api, com tela de login, guarda de sessão via JWT em localStorage, e polling a cada 15s.
- `.env.example` novos em `api/`, `ingestion/`, `edge/` (não existiam nenhum antes) e `dashboard/`.
- `shomer-standalone/infra/clickhouse/ddl/events.sql` — adicionei a coluna `event_version` (faltava, o envelope do edge manda esse campo).

## O que eu NÃO consegui validar (faça isso agora)

1. **`npm install` real em `api/` e `ingestion/`** — no meu sandbox o registry do npm ficou instável/lento e nunca completou. Rode `npm install` nos dois. Se dor erro, me diga qual.
2. **Compilação**: `npm run build` (nest build) em `api/` e `ingestion/`. Só consegui validar `tsc --noEmit` do `dashboard` (passou limpo, 0 erros) — não validei `next build` completo (travou por lentidão de I/O no meu sandbox, incerto se é erro real ou só ambiente lento). Rode `npm run build` no `dashboard` também.
3. **Testes**: `npm test` em `api/` e `ingestion/` (escrevi specs para `AuthService`, `StatsService`, `EventsService`, `DeviceAuthGuard` — nunca rodei, só revisei manualmente).
4. **Subir a infra**: `cd shomer-standalone/infra && docker-compose up -d` (Postgres, ClickHouse, Redis).
5. **Rodar a migration + seed da api**: dentro de `shomer-standalone/api`, copie `.env.example` para `.env`, rode `npm run migration:run` e depois `npm run seed` (cria `admin@shomer.com` / `admin123`, ou o que você configurar em `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`).
6. **Confirmar o schema do ClickHouse**: os containers já criam a tabela `events` automaticamente via `infra/clickhouse/ddl/events.sql` (montado em `/docker-entrypoint-initdb.d`). Confirme que a tabela subiu com a coluna nova `event_version` — se o volume do ClickHouse já existir de um teste anterior seu, pode ser preciso `docker-compose down -v` para recriar do zero.
7. **Copiar os `.env.example` para `.env`** em `api/`, `ingestion/`, `edge/` e `dashboard/.env.local` (o Next.js usa `.env.local`, não `.env` — atenção a isso).
8. **Subir os 4 serviços**:
   - `cd shomer-standalone/api && npm run start:dev` (porta 3000)
   - `cd shomer-standalone/ingestion && npm run start:dev` (porta 3001)
   - `cd shomer-standalone/dashboard && npm run dev` (porta 3002)
   - `cd shomer-standalone/edge && .venv/Scripts/python.exe -m uvicorn src.main:app --reload --port 8000` (MODE=mock por padrão no `.env.example`)
9. **Confirmar o fluxo real**: com tudo no ar, o `edge` em modo mock começa a mandar `person.detected` a cada ~5s para `POST http://localhost:3001/events`. Verifique:
   - Os headers `x-edge-device-id`/`x-device-key` do edge (`EDGE_DEVICE_ID`/`DEVICE_KEY` no `edge/.env`) batem com `EDGE_DEVICES` no `ingestion/.env` (`test-device-id:test-device-key` por padrão nos dois — não deveria precisar mudar nada se você só copiou os `.env.example`).
   - `GET http://localhost:3001/api/docs` (Swagger do ingestion) e `GET http://localhost:3000/api/docs` (Swagger da api) sobem sem erro.
   - Depois de alguns eventos, `GET http://localhost:3000/stats/overview` (com `Authorization: Bearer <token do login>`) mostra `visitorsToday > 0`.
   - Abra `http://localhost:3002`, faça login com as credenciais do seed, e confirme que os números da home (Visitantes hoje, Agora, Pico do dia, Fluxo, gráfico, movimento por horário) mudam de "0 zerado" para valores reais crescendo ao longo do tempo — não devem mais aparecer os números fixos antigos (1.284, 37, 178 etc.).

## O que EU SEI que ficou incompleto de propósito (não é bug, é escopo)

- O painel "Comparativo da loja" (Ontem / Média 7 dias) mostra "—" porque não implementei consultas históricas multi-dia — só existe "hoje". Isso é esperado.
- `entriesToday`/`exitsToday` (linha "Fluxo") vão ficar em 0 rodando só o modo mock, porque o gerador mock manda `person.detected`, não `person.line_crossed` (esse só existe no `MODE=production`, com câmera de verdade). Isso também é esperado — não é bug.
- Autenticação de dispositivo edge no `ingestion` é via variável de ambiente (`EDGE_DEVICES`), não uma tabela `devices` no Postgres. Deixei isso documentado no código (`device-auth.guard.ts`) como uma simplificação de MVP.
- Capacidade da loja para o cálculo de % de ocupação é um valor fixo (`STORE_CAPACITY = 88`) no `dashboard/app/page.tsx` — não existe configuração de capacidade por loja ainda.

## O que eu quero de volta

Depois de validar os passos acima, me diga: (1) o que funcionou de primeira, (2) o que você teve que corrigir e o que era o bug, (3) se o dashboard realmente mostrou dados reais mudando ao vivo. Não precisa reescrever nada que já está funcionando — só corrija o que quebrar e me avise o que foi.
