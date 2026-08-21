# SHOMER Edge Service

Serviço de captura de vídeo e visão computacional (YOLOv8 + ByteTrack) que
roda **dentro da rede do cliente**, na mesma LAN das câmeras. Só envia
eventos/métricas para fora (HTTPS de saída) — nunca precisa expor a câmera
para a internet.

## Configurando uma câmera Intelbras

As câmeras/DVRs/NVRs Intelbras são OEM Dahua e falam RTSP no formato:

```
rtsp://usuario:senha@IP:554/cam/realmonitor?channel=N&subtype=S
```

- `channel`: 1 = primeira câmera do DVR/NVR (para câmera IP standalone, use 1)
- `subtype`: 0 = mainstream (resolução cheia), 1 = substream (mais leve, use
  se a detecção estiver com lag ou a CPU estourar)

Duas formas de configurar em `edge/.env`:

**Opção A — informar host/usuário/senha e deixar o sistema montar a URL:**

```
CAMERA_INTELBRAS_HOST=192.168.0.10
CAMERA_INTELBRAS_USER=admin
CAMERA_INTELBRAS_PASSWORD=sua-senha
CAMERA_INTELBRAS_CHANNEL=1
CAMERA_INTELBRAS_SUBTYPE=0
```

**Opção B — informar a URL RTSP pronta (funciona para qualquer marca):**

```
RTSP_URL=rtsp://admin:sua-senha@192.168.0.10:554/cam/realmonitor?channel=1&subtype=0
```

## Validando a conexão antes de subir o serviço completo

```bash
python scripts/test_camera_connection.py --intelbras-host 192.168.0.10 \
    --intelbras-user admin --intelbras-password sua-senha
```

O script abre a câmera, lê frames por alguns segundos e reporta resolução,
FPS medido e diagnóstico do erro (credenciais, canal errado, host
inalcançável, RTSP desabilitado no cadastro da câmera).

Também dá para checar o status do worker já em execução via
`GET /vision/status` (campos `camera_connected`, `last_error`,
`frames_processed`, `last_frame_at`).

## Descobrindo o IP e habilitando RTSP na câmera

1. No app Intelbras Mibo/iNVD (o mesmo que o cliente já usa), veja o IP da
   câmera/DVR em "Configurações do dispositivo" → "Rede".
2. Confirme que RTSP está habilitado (geralmente já vem ligado por padrão;
   em alguns modelos fica em "Rede" → "Porta" → RTSP, porta padrão 554).
3. Use o usuário/senha de administração da câmera (não o login do app —
   o app pode usar um usuário de nuvem diferente do usuário local RTSP).

## Validando o mapa de calor com um vídeo gravado

`CAMERA_SOURCE` aceita um caminho de arquivo de vídeo, não só RTSP — dá para
rodar o pipeline completo (detecção → evento → ClickHouse → dashboard) sobre
uma gravação já existente, sem precisar da câmera ao vivo:

```
MODE=production
CAMERA_SOURCE=C:\caminho\para\video-5h.mp4
DETECTION_EVENTS_ENABLED=true
```

Suba o edge (`python -m src.main` ou `docker compose up edge`) junto com
`ingestion`, `api` e `dashboard`. Confira em tempo real:

- `GET http://localhost:8000/vision/status` — `frames_processed` subindo,
  `camera_connected: true`
- `GET http://localhost:3000/stats/heatmap` (autenticado) — células com
  `count > 0` conforme os eventos chegam
- Dashboard → **Mapa de calor** — visualização da densidade

Quando o vídeo termina, o worker detecta a falha de leitura e tenta
reconectar (reabre o arquivo do início) — então ele reinicia o vídeo em vez
de travar; não precisa ficar reiniciando o processo manualmente durante um
teste longo.

## Snapshot da câmera (fundo do mapa de calor)

`GET /vision/snapshot` retorna o último frame capturado como JPEG (imagem
estática, não stream contínuo). O dashboard usa isso como fundo da tela de
mapa de calor, pra sobrepor a grade de densidade na visão real da câmera em
vez de mostrar só um retângulo abstrato. Configure
`NEXT_PUBLIC_EDGE_URL=http://IP-DO-EDGE:8000` no `dashboard/.env.local` —
só funciona se o navegador conseguir alcançar essa URL (ok na validação
local; numa implantação remota precisa de proxy/túnel, ver seção de
câmeras acima). Sem essa variável configurada, a tela cai de volta pra
grade sem imagem de fundo.

## Reconexão

Se a câmera cair (rede instável, reboot do DVR), o worker tenta reconectar
com backoff exponencial (`CAMERA_RECONNECT_SECONDS` até
`CAMERA_RECONNECT_MAX_SECONDS`), para não martelar o dispositivo com
tentativas constantes.
