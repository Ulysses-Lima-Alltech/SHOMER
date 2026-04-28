# Script para verificar se Docker está rodando
Write-Host "🔍 Verificando Docker..." -ForegroundColor Cyan

$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker Desktop não está rodando!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Por favor:" -ForegroundColor Yellow
    Write-Host "1. Abra o Docker Desktop" -ForegroundColor White
    Write-Host "2. Aguarde até que ele esteja totalmente iniciado" -ForegroundColor White
    Write-Host "3. Execute este script novamente" -ForegroundColor White
    exit 1
}

Write-Host "✅ Docker está rodando!" -ForegroundColor Green
exit 0




