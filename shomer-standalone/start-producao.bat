@echo off
REM ============================================
REM SHOMER - Recuperacao completa de producao
REM ============================================
REM Sobe tudo que a versao publicada no Vercel
REM (shomer-amber.vercel.app, atras de alltechbr.com/shomer)
REM precisa para funcionar com dados reais desta maquina:
REM   1) Infra local (Postgres, ClickHouse, Redis)
REM   2) API (porta 3000) e Ingestion (porta 3001)
REM   3) Tunel Cloudflare -> e o que o Vercel chama (NEXT_PUBLIC_API_URL
REM      configurado no projeto Vercel aponta pra essa URL; se ela mudar,
REM      o Vercel para de enxergar os dados e precisa reconfigurar/
REM      redeployar la). ATENCAO: isso aqui usa "cloudflared tunnel --url",
REM      um tunel RAPIDO/temporario - ele gera uma URL aleatoria nova
REM      (https://palavras-aleatorias.trycloudflare.com) toda vez que
REM      reinicia, diferente do dominio fixo que o ngrok dava antes. Depois
REM      de rodar este .bat, PRECISA copiar a URL nova da janela do
REM      cloudflared e atualizar NEXT_PUBLIC_API_URL no projeto Vercel (e
REM      redeployar) antes do dashboard voltar a funcionar. Pra evitar isso
REM      a cada restart, migre pra um tunel nomeado (cloudflared tunnel
REM      create + DNS fixo) quando tiver um domínio proprio disponivel.
REM   4) As 4 cameras de producao do cliente 1005 (Ca Rabello),
REM      ligadas no DVR Intelbras real via Tailscale
REM
REM Se a maquina desligar/reiniciar por qualquer motivo, so rodar
REM este arquivo de novo restaura tudo.

echo.
echo ============================================
echo   SHOMER - Subindo producao completa
echo ============================================
echo.

echo [1/5] Verificando Docker Desktop...
docker ps >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

echo Docker Desktop ainda nao respondeu - isso e normal logo apos ligar o PC
echo (o Docker Desktop demora 1-2 minutos pra terminar de inicializar).
echo Tentando iniciar o Docker Desktop e aguardando ficar pronto...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"

set /a tentativas=0
:docker_wait
set /a tentativas+=1
if %tentativas% gtr 24 (
    echo [ERRO] Docker Desktop nao ficou pronto depois de 2 minutos.
    echo Abra o Docker Desktop manualmente, espere a baleia ficar verde/parada, e rode este .bat de novo.
    pause
    exit /b 1
)
timeout /t 5 /nobreak >nul
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo   ainda aguardando Docker... (%tentativas%/24)
    goto docker_wait
)

:docker_ready
echo [OK] Docker esta rodando
echo.

echo [2/5] Subindo infraestrutura (PostgreSQL, ClickHouse, Redis)...
cd infra
docker-compose up -d
cd ..
echo Aguardando infraestrutura ficar pronta...
timeout /t 10 /nobreak >nul
echo [OK] Infraestrutura no ar
echo.

echo [3/5] Subindo API (porta 3000) e Ingestion (porta 3001)...
start "SHOMER - API Backend" cmd /k "cd /d %~dp0api && node dist\main.js"
timeout /t 3 /nobreak >nul
start "SHOMER - Ingestion Service" cmd /k "cd /d %~dp0ingestion && node dist\main.js"
timeout /t 3 /nobreak >nul
echo [OK] API e Ingestion iniciados
echo.

echo [4/5] Abrindo tunel Cloudflare (URL nova a cada restart - ver aviso acima)...
start "SHOMER - Cloudflare tunnel" cmd /k "cloudflared tunnel --url http://localhost:3000"
timeout /t 3 /nobreak >nul
echo [OK] Tunel Cloudflare iniciado - copie a URL https://...trycloudflare.com
echo      da janela do cloudflared e atualize NEXT_PUBLIC_API_URL no Vercel.
echo.

echo [5/5] Subindo as 4 cameras de producao (tenant 1005 - Ca Rabello)...
call start-1005.bat
echo [OK] Cameras iniciadas
echo.

echo ============================================
echo   Producao no ar!
echo ============================================
echo   API local:       http://localhost:3000
echo   Ingestion local:  http://localhost:3001
echo   API via Cloudflare: veja a URL https://...trycloudflare.com na janela do tunel
echo   Dashboard (Vercel): https://alltechbr.com/shomer
echo   Cameras:          portas 8001-8004 (cam1=8004, cam2=8001, cam3=8002, cam4=8003)
echo ============================================
echo.
echo Verifique as janelas abertas para confirmar que nao ha erros
echo (principalmente a janela do tunel Cloudflare - ela precisa ficar aberta,
echo  e a URL trycloudflare.com dela precisa bater com o NEXT_PUBLIC_API_URL
echo  configurado no Vercel).
echo.
pause
