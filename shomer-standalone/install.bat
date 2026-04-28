@echo off
echo ?? Instalando dependencias do SHOMER Standalone...
echo.

echo ?? Instalando dependencias da API...
cd api
call npm install --production
cd ..

echo ?? Instalando dependencias do Ingestion...
cd ingestion
call npm install --production
cd ..

echo ?? Instalando dependencias do Dashboard...
cd dashboard
call npm install --production
cd ..

echo ?? Instalando dependencias do Edge Service...
cd edge
pip install -r requirements.txt
cd ..

echo.
echo ? Instalacao concluida!
echo.
echo Para iniciar os servicos, execute: start.bat
pause
