@echo off
REM ============================================
REM SHOMER - Script para Parar Serviços
REM ============================================

echo.
echo ============================================
echo   Parando servicos SHOMER...
echo ============================================
echo.

REM Parar containers Docker
echo Parando infraestrutura (PostgreSQL, ClickHouse, Redis)...
cd infra
docker-compose down
cd ..

echo.
echo ============================================
echo   Servicos parados!
echo ============================================
echo.
echo Nota: As janelas dos servicos Node.js/Python precisam ser fechadas manualmente.
echo.
pause




