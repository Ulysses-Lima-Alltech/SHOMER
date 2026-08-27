# Shomer — site institucional

Landing page estática (HTML/CSS/JS puro, sem build) para apresentar o Shomer — visão computacional para varejo.

## Rodar localmente

```bash
cd marketing-site
python -m http.server 8080
```

Depois abra http://localhost:8080/index.html — ou simplesmente abra o arquivo `index.html` direto no navegador (não usa nenhum bundler).

## Estrutura

```
marketing-site/
├── index.html       # a página inteira (HTML + CSS + JS inline)
├── assets/
│   └── hero.jpg      # print real do painel Shomer, capturado ao vivo numa loja piloto
└── README.md
```

## Antes de publicar de verdade

- [x] CTA de e-mail e WhatsApp usam os contatos reais do cartão de visitas do Shomer (`Marketing/Cartao de Visitas SHOMER.dc.html`): `contato@alltechbr.com` e `(12) 99212-9355`. Confirme que esse WhatsApp está sendo monitorado antes de divulgar o link.
- [ ] Os números mostrados (mapa de calor, validação ao vivo, relatórios) são dados reais capturados numa loja parceira em 26/08/2026. Atualize quando fizer sentido, sem inventar números maiores só para parecer mais "pronto".
- [ ] As tags `og:image`/`twitter:image` usam caminho relativo (`assets/hero.jpg`). Depois do deploy, troque para a URL absoluta (ex: `https://shomer.seu-dominio.com/assets/hero.jpg`) — WhatsApp e LinkedIn nem sempre resolvem caminho relativo corretamente.
- [ ] Sem depoimentos nem logos de cliente — de propósito, para não usar nome/logo de cliente sem autorização explícita dele. Adicione assim que tiver essa permissão.

## Deploy

Por ser HTML estático puro, sobe em qualquer host: Vercel, Netlify, GitHub Pages, ou como uma rota estática dentro do projeto Vercel que já hospeda `alltechbr.com`. Não precisa de Node, build step nem variável de ambiente.

## Fontes de dados usadas no texto

- Print do painel (hero): captura real de `alltechbr.com/shomer`, aba "Visão geral", 26/08/2026.
- Números do mapa de calor: captura real de `alltechbr.com/shomer/mapa-de-calor` (2.963 pontos, zona central, 7% concentração, 33% área com movimento, pico às 17h).
- Números da validação ao vivo: captura real de `alltechbr.com/shomer/ao-vivo`, câmera "Joias" (41 entradas, 36 saídas, 80.730 frames processados).
- Confirmado no código-fonte (`shomer-standalone/edge/src/vision/detector.py`) que a detecção atual usa YOLO + ByteTrack — não há reconhecimento facial no pipeline em produção, o que embasa a seção de Privacidade.
- Logo (hexágono + barras) e contatos: extraídos do cartão de visitas já desenhado em `Marketing/Cartao de Visitas SHOMER.dc.html`, para manter a mesma identidade visual entre o site e o material impresso.
