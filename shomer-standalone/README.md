# SHOMER - Build Standalone

Este é um build standalone do sistema SHOMER. Você pode copiar esta pasta para qualquer computador e executar.

## ⚠️ IMPORTANTE: O que você precisa no computador de destino

Antes de usar este build, o computador precisa ter instalado:

1. **Docker Desktop** (obrigatório)
   - Download: https://www.docker.com/products/docker-desktop
   - Deve estar RODANDO antes de iniciar os serviços

2. **Node.js 18 ou superior** (obrigatório)
   - Download: https://nodejs.org/
   - Instale a versão LTS

3. **Python 3.11 ou superior** (obrigatório)
   - Download: https://www.python.org/downloads/
   - Durante instalação, marque "Add Python to PATH"

## 🚀 Passo a Passo para Executar

### Primeira vez no computador (apenas uma vez)

1. **Copie a pasta shomer-standalone para o computador**

2. **Instale as dependências** (apenas uma vez):
   \\\atch
   install.bat
   \\\
   
   Isso instalará as dependências Node.js e Python necessárias.

3. **Inicie a infraestrutura (Docker)**:
   \\\atch
   cd infra
   docker-compose up -d
   cd ..
   \\\

4. **Execute os serviços**:
   \\\atch
   start.bat
   \\\

### Execuções seguintes

Depois da primeira vez, você só precisa:

1. **Iniciar Docker Desktop** (se não estiver rodando)

2. **Iniciar infraestrutura** (se não estiver rodando):
   \\\atch
   cd infra
   docker-compose up -d
   cd ..
   \\\

3. **Executar serviços**:
   \\\atch
   start.bat
   \\\

## 📍 Acessos

Após iniciar todos os serviços, aguarde alguns segundos e acesse:

- **Dashboard**: http://localhost:3002
- **API Swagger**: http://localhost:3000/api/docs
- **Ingestion Swagger**: http://localhost:3001/api/docs
- **Edge Service**: http://localhost:8000

## 📝 Resumo

✅ **Você PODE**: Copiar a pasta para qualquer computador
✅ **Você PODE**: Executar após instalar dependências uma vez
❌ **Você NÃO PODE**: Executar sem Docker, Node.js e Python instalados
❌ **Você NÃO PODE**: Executar sem executar install.bat na primeira vez

## 🔧 Troubleshooting

### "comando npm não encontrado"
- Instale Node.js: https://nodejs.org/
- Reinicie o terminal após instalar

### "comando python não encontrado"
- Instale Python: https://www.python.org/downloads/
- Durante instalação, marque "Add Python to PATH"
- Reinicie o terminal após instalar

### "Docker não está rodando"
- Abra o Docker Desktop
- Aguarde até aparecer "Engine running"

### Erro de porta em uso
- Verifique se os serviços já estão rodando
- Feche outros programas usando as portas 3000, 3001, 3002, 8000

### Erro de módulo não encontrado
- Execute \install.bat\ novamente

## 📦 Estrutura

\\\
shomer-standalone/
├── api/              # API compilada
├── ingestion/        # Ingestion compilada
├── dashboard/        # Dashboard compilado
├── edge/             # Edge Service (Python)
├── infra/            # Docker Compose
├── install.bat       # Instala dependências (executar 1x)
├── start.bat         # Inicia serviços
└── README.md         # Este arquivo
\\\

---
Build criado em: 2026-01-05 18:35:41
Versão: Standalone Build
