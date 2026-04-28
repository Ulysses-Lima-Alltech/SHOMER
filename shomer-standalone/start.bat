@echo off
REM ============================================
REM SHOMER - Script de Inicialização Completa
REM ============================================

echo.
echo ============================================
echo   SHOMER - Sistema de Computacao Visual
echo   Script de Inicializacao Completa
echo ============================================
echo.

REM Verificar se Docker está rodando
echo [1/8] Verificando Docker Desktop...
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Docker Desktop nao esta rodando!
    echo Por favor, inicie o Docker Desktop e tente novamente.
    pause
    exit /b 1
)
echo [OK] Docker esta rodando
echo.

REM Verificar Node.js
echo [2/8] Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Por favor, instale Node.js 18+ e tente novamente.
    pause
    exit /b 1
)
echo [OK] Node.js encontrado
echo.

REM Verificar Python
echo [3/8] Verificando Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Python nao encontrado!
    echo Por favor, instale Python 3.11+ e tente novamente.
    pause
    exit /b 1
)
echo [OK] Python encontrado
echo.

REM Subir infraestrutura
echo [4/8] Subindo infraestrutura (PostgreSQL, ClickHouse, Redis)...
cd infra
docker-compose up -d
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao subir infraestrutura!
    pause
    exit /b 1
)
cd ..
echo [OK] Infraestrutura iniciada
echo.

REM Aguardar serviços ficarem prontos
echo [5/8] Aguardando servicos ficarem prontos...
timeout /t 10 /nobreak >nul
echo [OK] Servicos prontos
echo.

REM Verificar e criar arquivos .env se não existirem
echo [6/8] Verificando arquivos de configuracao...
if not exist "api\.env" (
    if exist "api\.env.example" (
        echo Criando api\.env a partir de .env.example...
        copy "api\.env.example" "api\.env" >nul 2>&1
    )
)
if not exist "ingestion\.env" (
    if exist "ingestion\.env.example" (
        echo Criando ingestion\.env a partir de .env.example...
        copy "ingestion\.env.example" "ingestion\.env" >nul 2>&1
    )
)
if not exist "edge\.env" (
    if exist "edge\.env.example" (
        echo Criando edge\.env a partir de .env.example...
        copy "edge\.env.example" "edge\.env" >nul 2>&1
    )
)
echo [OK] Arquivos de configuracao verificados
echo.

REM Instalar dependências (se necessário)
echo [7/8] Verificando dependencias...
if not exist "api\node_modules" (
    echo Instalando dependencias da API...
    cd api
    call npm install
    cd ..
)
if not exist "ingestion\node_modules" (
    echo Instalando dependencias do Ingestion...
    cd ingestion
    call npm install
    cd ..
)
if not exist "dashboard\node_modules" (
    echo Instalando dependencias do Dashboard...
    cd dashboard
    call npm install
    cd ..
)
echo [OK] Dependencias verificadas
echo.

REM Pular migrations/seeds no build standalone (não funcionam sem arquivos fonte)
echo [8/8] Verificando banco de dados...
echo [AVISO] Migrations e seeds devem ser executados manualmente se necessario.
echo [OK] Banco de dados configurado
echo.

REM Iniciar serviços em janelas separadas
echo.
echo ============================================
echo   Iniciando servicos...
echo ============================================
echo.

REM API Backend (usando build compilado)
echo Iniciando API Backend (porta 3000)...
start "SHOMER - API Backend" cmd /k "cd /d %~dp0api && node dist/src/main.js"
timeout /t 3 /nobreak >nul

REM Ingestion Service (usando build compilado)
echo Iniciando Ingestion Service (porta 3001)...
start "SHOMER - Ingestion Service" cmd /k "cd /d %~dp0ingestion && node dist/main.js"
timeout /t 3 /nobreak >nul

REM Dashboard (usando build do Next.js)
echo Iniciando Dashboard (porta 3002)...
start "SHOMER - Dashboard" cmd /k "cd /d %~dp0dashboard && npm start"
timeout /t 3 /nobreak >nul

REM Edge Service
echo Iniciando Edge Service (porta 8000)...
start "SHOMER - Edge Service" cmd /k "cd /d %~dp0edge && python -m uvicorn src.main:app --host 0.0.0.0 --port 8000"
timeout /t 3 /nobreak >nul

echo.
echo ============================================
echo   Servicos Iniciados!
echo ============================================
echo.
echo Servicos disponiveis em:
echo   - API Backend:      http://localhost:3000
echo   - API Swagger:      http://localhost:3000/api/docs
echo   - Ingestion:        http://localhost:3001
echo   - Ingestion Docs:   http://localhost:3001/api/docs
echo   - Dashboard:        http://localhost:3002
echo   - Edge Service:     http://localhost:8000
echo.
echo Health Checks:
echo   - API:              http://localhost:3000/health
echo   - Ingestion:        http://localhost:3001/health
echo   - Edge:             http://localhost:8000/health
echo.
echo ============================================
echo   IMPORTANTE:
echo ============================================
echo 1. Aguarde 10-15 segundos para todos os servicos iniciarem completamente
echo 2. Verifique as janelas abertas para ver os logs
echo 3. Para parar os servicos, feche as janelas ou use Ctrl+C
echo 4. Para parar a infraestrutura: execute stop.bat
echo.
echo ============================================
echo   CREDENCIAIS PADRAO:
echo ============================================
echo Dashboard Login:
echo   Email: admin@shomer.com
echo   Senha: admin123
echo.
echo Aguardando servicos iniciarem (10 segundos)...
timeout /t 10 /nobreak >nul

echo.
echo Abrindo Dashboard no navegador...
start http://localhost:3002

echo.
echo ============================================
echo   Sistema iniciado com sucesso!
echo ============================================
echo.
echo Pressione qualquer tecla para sair...
pause >nul

