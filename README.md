# DigitalSignage-Lite

Sistema simplificado de controle de conteúdo para Android TV Boxes.

## 🎯 Objetivo

Controlar individualmente o conteúdo exibido em Android TV Boxes através de um painel administrativo web, com foco em simplicidade e eficiência.

## 🏗️ Arquitetura

```
/signage-project
├── /frontend-admin     # Painel administrativo (React + Vite)
├── /backend           # API Node.js + WebSocket
└── README.md
```

## 🚀 Tecnologias

### Frontend
- React.js com Vite
- Tailwind CSS
- Axios
- WebSocket client

### Backend
- Node.js + Express
- WebSocket Server
- Multer (upload de arquivos)

### Banco de Dados
- Supabase (PostgreSQL)
- Supabase Storage

## 📋 Funcionalidades

### ✅ Fluxo de Cadastro Automatizado
1. **Admin**: Clica em "Gerar Link de Cadastro"
2. **Sistema**: Gera token único e exibe link completo
3. **TV Box**: Acessa o link, insere nome do dispositivo
4. **Sistema**: Registra dispositivo e gera URL do player
5. **Admin**: Vê novo dispositivo no dashboard automaticamente

### ✅ Painel Administrativo
- **Dashboard**: Cards individuais para cada TV Box
- **Status**: Indicador visual online/offline em tempo real
- **Gestão de Conteúdo**: Modal para upload e organização
- **Controle de Bloqueio**: Botão para bloquear/desbloquear dispositivos

### ✅ Gerenciamento de Conteúdo
- Upload de imagens e vídeos
- Configuração de tempo de exibição
- Organização por ordem de exibição
- Exclusão de conteúdo

### ✅ Comunicação em Tempo Real
- WebSocket para comunicação instantânea
- Atualizações de status automáticas
- Comandos remotos (bloqueio/desbloqueio)
- Notificações de novos dispositivos

## 🗄️ Estrutura do Banco

### Tabelas

**devices**
```sql
- id (uuid, PK)
- name (text)
- status (text) -- 'online', 'offline', 'blocked'
- created_at (timestamp)
```

**content**
```sql
- id (uuid, PK)
- device_id (uuid, FK)
- file_url (text)
- file_type (text) -- 'image', 'video'
- duration (int) -- segundos
- display_order (int)
```

**pairing_tokens**
```sql
- token (text, PK)
- is_used (boolean)
- created_at (timestamp)
```

## 🔧 Configuração

### 1. Configurar Supabase

1. Crie um projeto no [Supabase](https://supabase.com)
2. Execute as migrations SQL para criar as tabelas
3. Configure o Supabase Storage para uploads
4. Copie as credenciais para o arquivo `.env`

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Configure as variáveis do Supabase no .env
npm run dev
```

### 3. Frontend

```bash
npm install
npm run dev
```

## 🌐 URLs

- **Painel Admin**: `http://localhost:3000`
- **API Backend**: `http://localhost:3001`
- **Cadastro de Dispositivo**: `http://localhost:3000/cadastrar/{token}`
- **Player da TV Box**: `http://localhost:3000/player/{device_id}`

## 📱 Fluxo de Uso

### Para o Administrador:
1. Acesse o painel admin
2. Clique em "Gerar Link de Cadastro"
3. Copie o link e acesse na TV Box
4. Gerencie conteúdo clicando nos cards dos dispositivos
5. Use o botão de bloqueio quando necessário

### Para a TV Box:
1. Acesse o link de cadastro fornecido
2. Digite um nome para o dispositivo
3. Será redirecionado para a URL do player
4. O conteúdo será exibido automaticamente
5. Recebe comandos em tempo real via WebSocket

## 🎨 Otimizações

- **Resolução**: Otimizado para 1080 x 1920 (vertical)
- **Performance**: Player leve e eficiente
- **Responsivo**: Interface adaptável
- **Tempo Real**: Atualizações instantâneas via WebSocket

## 🔒 Segurança

- Tokens de pareamento de uso único
- Validação de tipos de arquivo
- Limite de tamanho de upload (100MB)
- CORS configurado
- Headers de segurança com Helmet

## 📊 Monitoramento

- Status em tempo real dos dispositivos
- Logs de conexão/desconexão
- Controle de conteúdo por dispositivo
- Sistema de bloqueio remoto

## 🚀 Deploy

### Desenvolvimento Local
```bash
# Backend
cd backend && npm run dev

# Frontend
npm run dev
```

### Produção
```bash
# Build frontend
npm run build

# Start backend
cd backend && npm start
```

## 📝 Notas Técnicas

- Sistema focado em simplicidade e performance
- Comunicação WebSocket para tempo real
- Upload direto para servidor local
- Sem autenticação complexa (foco na funcionalidade)
- Otimizado para redes locais

## 🎯 Casos de Uso

- **Lojas**: Promoções e ofertas em TVs
- **Restaurantes**: Cardápios digitais
- **Escritórios**: Avisos e comunicados
- **Eventos**: Informações e programação
- **Recepções**: Conteúdo institucional

---

**DigitalSignage-Lite** - Controle simples e eficiente para suas telas digitais! 📺✨