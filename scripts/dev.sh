#!/bin/bash
# Script para desenvolvimento
# Uso: ./scripts/dev.sh

set -e

echo "🚀 Iniciando ambiente de desenvolvimento SHOMER"

# Verifica se Docker está rodando
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker não está rodando. Por favor, inicie o Docker."
    exit 1
fi

# Sobe infraestrutura
echo ""
echo "🐳 Subindo infraestrutura..."
cd infra
docker-compose up -d
cd ..

echo ""
echo "⏳ Aguardando serviços ficarem prontos..."
sleep 10

# Verifica saúde dos serviços
echo ""
echo "🏥 Verificando saúde dos serviços..."

if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ API: OK"
else
    echo "⚠️  API: Não está rodando (execute: npm run dev:api)"
fi

if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Ingestion: OK"
else
    echo "⚠️  Ingestion: Não está rodando (execute: npm run dev:ingestion)"
fi

if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Edge: OK"
else
    echo "⚠️  Edge: Não está rodando (execute: npm run dev:edge)"
fi

echo ""
echo "📝 Para rodar os serviços:"
echo "   API:        npm run dev:api"
echo "   Ingestion:  npm run dev:ingestion"
echo "   Dashboard:  npm run dev:dashboard"
echo "   Edge:       cd edge && python -m uvicorn src.main:app --reload --port 8000"

echo ""
echo "✅ Ambiente pronto!"




