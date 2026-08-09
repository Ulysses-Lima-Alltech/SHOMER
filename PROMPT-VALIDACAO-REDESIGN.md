# Prompt para Claude Code (VSCode) — Validar o redesign de UX do dashboard

Cole no Claude Code, com o repo aberto e a infra (Postgres/ClickHouse/Redis) já validada da rodada anterior.

---

Acabei de aplicar um redesign de UX no `shomer-standalone/dashboard`, baseado em pesquisa sobre boas práticas de dashboards de varejo para gerentes de loja (hierarquia visual, farol de status, alertas, mobile-first, 5-7 KPIs por tela). Preciso que você valide se compila e funciona — no meu sandbox `next build` trava por lentidão de I/O (mesmo problema da vez passada), mas `tsc --noEmit` passou limpo tanto no `dashboard` quanto na `api`, e os 7 testes de `stats.service.spec.ts` (incluindo os novos) passam.

## O que mudou

**Backend (`api`)** — `src/stats/`:
- `OverviewStats` ganhou `lastEventAt` (timestamp do último evento recebido de qualquer tipo, para o indicador "ao vivo").
- Dois endpoints novos: `GET /stats/daily?days=7|14|30` (série diária + total + média + melhor dia) e `GET /stats/hourly-pattern?days=7|14|30` (padrão médio de movimento por hora, para planejamento de escala).

**Frontend (`dashboard`)**:
- `components/Shell.tsx` (novo) — layout compartilhado: topbar, nav, tema, e um indicador "Ao vivo/Sem sinal" que consulta `lastEventAt` a cada 20s. Mostra um banner de alerta no topo se não há eventos recentes (ex: câmera/edge offline) — isso não existia antes.
- `components/Icons.tsx` (novo) — ícones inline em SVG, sem dependência nova no `package.json`.
- `app/page.tsx` (Visão Geral) — reescrita: agora usa `Shell`, cards de KPI com ícone (`.kpi-card`), removi o painel "Comparativo da loja" (que só mostrava "—" por falta de histórico) e troquei por uma chamada para a nova página de Relatórios.
- `app/reports/page.tsx` (novo) — página de Relatórios: seletor de período (7/14/30 dias), cards de resumo, gráfico de barras de visitantes por dia, gráfico de padrão médio por horário, exportação CSV client-side.
- `app/globals.css` — novos tokens (cor de aviso `--warning`, escala tipográfica, escala de espaçamento) e estilos dos componentes novos (status pill, alert banner, kpi cards, gráficos de relatório, skeleton de carregamento). Mantive o sistema de tema claro/escuro e os 4 acentos de cor já existentes, só ampliei.
- Nenhum player de câmera foi adicionado — como combinado, o front só mostra dados processados.

## O que eu quero que você valide

1. `cd shomer-standalone/dashboard && npm run build` — confirme que compila (eu só validei `tsc --noEmit`, não o build completo do Next).
2. `npm run dev`, com a `api` já rodando (`npm run start:dev`) e a infra no ar — abra `http://localhost:3002`, faça login, e veja se:
   - O indicador "Ao vivo" no canto superior direito aparece verde pulsante quando o edge mock está enviando eventos, e vira "Sem sinal" (banner de alerta amarelo aparece) se você parar o edge por alguns minutos.
   - Os 4 cards de KPI da Visão Geral aparecem com ícone, valor grande, e contexto.
   - O link "Ver relatórios completos →" leva para `/reports`.
   - Em `/reports`: o seletor 7/14/30 dias funciona, o gráfico de barras diário aparece (mesmo com só 1 dia de dado real, deve mostrar 1 barra alta e o resto zerado, sem quebrar), "Exportar CSV" baixa um arquivo, e o padrão por horário aparece.
   - Testar tema claro/escuro nas duas páginas — as cores novas (`--warning`, etc.) devem se adaptar nos dois modos.
   - Testar em uma viewport estreita (mobile) — a nav já colapsa em telas <1000px (comportamento herdado), confirme que os novos elementos (status pill, kpi-grid, reports) não quebram o layout.
3. `cd shomer-standalone/api && npm run build && npm test` — confirme que os endpoints novos compilam e os 7 testes de `stats.service.spec.ts` passam (eu já validei local, mas quero confirmação no seu ambiente com Node/npm completos).

## O que eu sei que pode precisar de ajuste (não é necessariamente bug)

- `GET /stats/daily` e `/stats/hourly-pattern` usam `timestamp >= today() - {days:UInt16} + 1` no ClickHouse — não validei essa sintaxe rodando de verdade (só revisei manualmente). Se der erro de sintaxe SQL, esse é o lugar mais provável.
- O gráfico de relatório é CSS/SVG simples feito à mão (sem lib de gráficos) para não adicionar dependência nova — funcional, mas não é tão polido quanto uma lib tipo Recharts (que já está no `package.json` mas não está sendo usada ainda).
- Só implementei as abas "Visão Geral" e "Relatórios" na nav — "Monitoramento", "Eventos" e "Dispositivos" ficam com botão desabilitado e tooltip "Em breve", por decisão de escopo.

Me diga o que funcionou, o que precisou de ajuste, e se o redesign passa no "teste do gerente de loja": dá pra entender o essencial em poucos segundos, no celular?
