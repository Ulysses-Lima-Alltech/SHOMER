# PowerShell script para desenvolvimento
# Uso: .\scripts\dev.ps1

Write-Host "🚀 Iniciando ambiente de desenvolvimento SHOMER" -ForegroundColor Green

# Verifica se Docker está rodando
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker não está rodando. Por favor, inicie o Docker Desktop." -ForegroundColor Red
    exit 1
}

# Sobe infraestrutura
Write-Host "`n🐳 Subindo infraestrutura..." -ForegroundColor Cyan
Set-Location infra
docker-compose up -d
Set-Location ..

Write-Host "`n⏳ Aguardando serviços ficarem prontos..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verifica saúde dos serviços
Write-Host "`n🏥 Verificando saúde dos serviços..." -ForegroundColor Cyan
try {
    $apiHealth = Invoke-RestMethod -Uri "http://localhost:3000/health" -ErrorAction Stop
    Write-Host "✅ API: OK" -ForegroundColor Green
} catch {
    Write-Host "⚠️  API: Não está rodando (execute: npm run dev:api)" -ForegroundColor Yellow
}

try {
    $ingestionHealth = Invoke-RestMethod -Uri "http://localhost:3001/health" -ErrorAction Stop
    Write-Host "✅ Ingestion: OK" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Ingestion: Não está rodando (execute: npm run dev:ingestion)" -ForegroundColor Yellow
}

try {
    $edgeHealth = Invoke-RestMethod -Uri "http://localhost:8000/health" -ErrorAction Stop
    Write-Host "✅ Edge: OK" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Edge: Não está rodando (execute: npm run dev:edge)" -ForegroundColor Yellow
}

Write-Host "`n📝 Para rodar os serviços:" -ForegroundColor Cyan
Write-Host "   API:        npm run dev:api" -ForegroundColor White
Write-Host "   Ingestion:  npm run dev:ingestion" -ForegroundColor White
Write-Host "   Dashboard:  npm run dev:dashboard" -ForegroundColor White
Write-Host "   Edge:       cd edge && python -m uvicorn src.main:app --reload --port 8000" -ForegroundColor White

Write-Host "`n✅ Ambiente pronto!" -ForegroundColor Green




