# Shomer - Sistema de Detecção Inteligente em Tempo Real

## 🎯 Visão Geral

O **Shomer** é um sistema avançado de detecção em tempo real que utiliza YOLOv8 e InsightFace para identificar pessoas e rostos em vídeo. O sistema oferece uma interface web moderna com autenticação, controle avançado de câmeras, monitoramento em tempo real e exportação de dados.

## ✨ Funcionalidades Principais

### 🔐 Sistema de Autenticação
- **Registro Seguro**: Sistema de registro com token de convite
- **Login JWT**: Autenticação baseada em tokens JWT
- **Proteção de Rotas**: Endpoints protegidos por autenticação
- **Gerenciamento de Usuários**: Interface para gerenciar usuários

### 🎥 Controle Avançado de Câmeras
- **Troca Dinâmica**: Mude entre webcam e IP camera em tempo real
- **Interface Intuitiva**: Botões estilizados para controle fácil
- **Status Visual**: Indicadores visuais do estado atual da câmera
- **Suporte a IP Cameras**: Compatível com DroidCam, IP Webcam e outras soluções

### 🎬 Controle de Stream
- **Liberação Manual**: O stream só é liberado quando você clicar em "Iniciar Stream"
- **Frame de Espera**: Tela informativa enquanto aguarda liberação
- **Controle Total**: Inicie e pare o stream quando quiser
- **Performance Otimizada**: Backend roda continuamente, apenas o stream é controlado

### 📊 Monitoramento e Analytics
- **Estatísticas em Tempo Real**: Contadores de pessoas detectadas
- **Métricas de Performance**: FPS, latência e uso de recursos
- **Logs Detalhados**
- **Exportação de Dados**: Exporte relatórios em CSV

### 🏗️ Arquitetura Moderna
- **Backend FastAPI**: API RESTful de alta performance
- **Frontend React**: Interface moderna com TypeScript
- **Banco PostgreSQL**: Armazenamento de dados relacional
- **Docker**: Containerização completa do sistema

## 🚀 Instalação e Uso

### Pré-requisitos
- Docker e Docker Compose
- Python 3.8+ (para desenvolvimento local)
- Node.js 16+ (para desenvolvimento local)
- Webcam ou fonte de vídeo
- (Opcional) IP Camera (DroidCam, IP Webcam, etc.)

### 🐳 Instalação com Docker (Recomendado)

1. **Clone o repositório**
```bash
git clone <repository-url>
cd Shomer-UIbuttons
```

2. **Configure as variáveis de ambiente**
```bash
cp .env.example .env.app
# Edite o arquivo .env.app com suas configurações
```

3. **Execute com Docker Compose**
```bash
docker-compose up -d
```

4. **Acesse a aplicação**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
  - PostgreSQL: localhost:5432
  - pgAdmin: http://localhost:5050

### 🔧 Instalação Local

#### 1. Backend

```bash
cd backend
pip install -r requirements.txt

# Configure o PostgreSQL (via Docker Compose incluído)

# Execute o backend
python main.py
```

#### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

## 🎮 Como Usar

### 1. Primeiro Acesso

1. **Acesse o Frontend**: Abra `http://localhost:5173`
2. **Registre-se**: Use o token de convite configurado no `.env.app`
3. **Faça Login**: Acesse com suas credenciais

### 2. Interface Principal

#### 🖥️ Controles de Câmera
- **Webcam**: Usa a câmera local do computador
- **IP Camera**: Usa câmera remota via rede

#### ▶️ Controle de Stream
- **Iniciar Stream**: Libera o stream de vídeo com detecções
- **Parar Stream**: Pausa o stream (mostra tela de espera)

#### 📊 Monitoramento
- **Status em Tempo Real**: Visualização do estado da câmera e stream
- **Estatísticas**: Contadores de pessoas detectadas
- **Performance**: FPS e métricas do sistema

## 🔧 Configuração

### Variáveis de Ambiente (.env.app)

```bash
# Configurações de Câmera
YOLO_MODEL=yolov8n.pt
CONF_THRESHOLD=0.5
TARGET_FPS=60
DETECTION_FPS=30

# Configurações do Servidor
HOST=0.0.0.0
PORT=8000

# Controle de Stream
STREAM_ENABLED_BY_DEFAULT=false

# Autenticação JWT
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=60

# Token de Convite
INVITATION_TOKEN=your-invitation-token

# Postgres
DATABASE_URL=postgresql+asyncpg://shomer_user:shomer_pass_123@postgres:5432/shomerdb
```

### Configurações de IP Camera

#### DroidCam
```python
"ip_camera": "http://192.168.1.100:4747/video"
```

#### IP Webcam
```python
"ip_camera": "http://192.168.1.100:8080/video"
```

#### Câmera Local
```python
"ip_camera": "0"  # Índice da câmera local
```

## 📡 API Endpoints

### Autenticação
- `POST /register` - Registrar novo usuário
- `POST /login` - Fazer login
- `GET /me` - Informações do usuário atual

### Controle de Câmera
- `POST /camera/switch?source=webcam` - Trocar para webcam
- `POST /camera/switch?source=ip_camera` - Trocar para IP camera
- `GET /camera/status` - Status atual da câmera

### Controle de Stream
- `POST /stream/control?action=start` - Iniciar stream
- `POST /stream/control?action=stop` - Parar stream

### Monitoramento
- `GET /stats` - Estatísticas em tempo real
- `GET /performance` - Métricas de performance
- `GET /health` - Status de saúde do sistema
- `GET /config` - Configurações do sistema

### Dados e Exportação
- `GET /export_log.csv` - Exportar logs em CSV
- `POST /logs` - Criar novo log
- `GET /logs` - Listar logs

## 🎨 Interface

### Design Moderno
- **Dark Theme**: Interface escura e moderna
- **Animações**: Transições suaves com Framer Motion
- **Status Visual**: Indicadores coloridos para diferentes estados
- **Layout Responsivo**: Funciona em desktop e mobile

### Componentes Principais
- **AuthPage**: Página de autenticação
- **Navbar**: Navegação com informações do usuário
- **Hero**: Seção de apresentação
- **Demo**: Dashboard principal com controles
- **VideoStream**: Exibição do stream com detecções
- **CameraControls**: Painel de controle de câmera
- **StatCard**: Cartões com estatísticas em tempo real
- **ExportButton**: Botão para exportar relatórios

## 🔍 Detecção

### Tecnologias Utilizadas
- **YOLOv8**: Detecção de pessoas
- **InsightFace**: Detecção facial
- **OpenCV**: Processamento de vídeo
- **MediaPipe**: Detecção adicional
- **FastAPI**: Backend API

### Performance
- **FPS**: 25-60 FPS dependendo do hardware
- **Latência**: <100ms para detecção
- **Precisão**: >90% para pessoas, >95% para rostos
- **Otimização**: Cache inteligente e threading avançado

## 🏗️ Arquitetura

### Estrutura do Projeto
```
Shomer-UIbuttons/
├── backend/
│   ├── main.py              # API FastAPI principal
│   ├── detection.py         # Detector otimizado
│   ├── config.py            # Configurações centralizadas
│   ├── (ORM)                # Conexão PostgreSQL (SQLAlchemy async)
│   ├── requirements.txt     # Dependências Python
│   └── shomer/              # Módulo principal
│       ├── application/     # Casos de uso
│       ├── domain/          # Entidades e portas
│       ├── infrastructure/  # Implementações
│       └── interfaces/      # Interfaces de usuário
├── frontend/
│   ├── src/
│   │   ├── components/      # Componentes React
│   │   ├── api.ts          # Cliente API
│   │   ├── app.tsx         # App principal
│   │   └── types/          # Definições TypeScript
│   ├── package.json        # Dependências Node.js
│   └── vite.config.js      # Configuração Vite
├── (pg-init/)              # Scripts de inicialização PostgreSQL (opcional)
├── docker-compose.yml      # Orquestração Docker
├── Dockerfile.backend      # Container do backend
├── Dockerfile.frontend     # Container do frontend
└── README.md               # Este arquivo
```

### Tecnologias Backend
- **FastAPI**: Framework web de alta performance
- **Uvicorn**: Servidor ASGI
- **PostgreSQL**: Banco de dados relacional
- **SQLAlchemy (async)**: ORM assíncrono
- **PyJWT**: Autenticação JWT
- **Passlib**: Hash de senhas
- **OpenCV**: Processamento de vídeo
- **Ultralytics**: YOLOv8
- **InsightFace**: Detecção facial

### Tecnologias Frontend
- **React 18**: Framework principal
- **TypeScript**: Tipagem estática
- **Vite**: Build tool e dev server
- **Tailwind CSS**: Framework CSS
- **Framer Motion**: Animações
- **Lucide React**: Ícones
- **Axios**: Cliente HTTP
- **React Router**: Roteamento
- **JWT Decode**: Decodificação de tokens

## 🚨 Solução de Problemas

### Câmera não conecta
1. Verifique se a webcam está funcionando
2. Teste com aplicativos nativos
3. Verifique permissões do navegador
4. Confirme se o backend está rodando

### IP Camera não funciona
1. Verifique se o IP está correto
2. Teste a URL no navegador
3. Verifique se está na mesma rede
4. Confirme se a porta está aberta

### Autenticação falha
1. Verifique se o token de convite está correto
2. Confirme se o PostgreSQL está rodando
3. Verifique as variáveis de ambiente JWT

### Stream não inicia
1. Clique em "Iniciar Stream"
2. Verifique se o backend está rodando
3. Confirme se a câmera está conectada
4. Verifique os logs do backend

### Performance baixa
1. Reduza a resolução da câmera
2. Ajuste o threshold de confiança
3. Use modelo YOLO menor (yolov8n.pt)
4. Verifique recursos do sistema

## 🔧 Desenvolvimento

### Executar em Modo Desenvolvimento

```bash
# Backend
cd backend
pip install -r requirements.txt
python main.py

# Frontend
cd frontend
npm install
npm run dev
```

### Estrutura de Desenvolvimento
- **Backend**: FastAPI com hot reload
- **Frontend**: Vite com hot reload
- **PostgreSQL**: Container Docker persistente
- **CORS**: Configurado para desenvolvimento

### Comandos Úteis

```bash
# Rebuild containers
docker-compose down
docker-compose up --build

# Ver logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Acessar pgAdmin: http://localhost:5050
```

## 📝 Licença

Este projeto está sob a licença MIT.

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📞 Suporte

Para suporte e dúvidas:
- Abra uma issue no GitHub
- Consulte a documentação da API em `/docs` quando o backend estiver rodando
- Verifique os logs do sistema

---

⭐ Se este projeto foi útil, considere dar uma estrela! 