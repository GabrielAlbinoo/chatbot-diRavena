## Chatbot diRavena

### Requisitos
- Node.js 18+ e npm
- Chave de API da Groq (enviado por email)

### Configuração
1) Na raiz do projeto, crie um arquivo `.env`

```
GROQ_API_KEY=coloque_sua_chave_aqui
GROQ_MODEL=llama3-70b-8192
PORT=3000
```

2) Instale as dependências:
```
npm install
```

### Executando
- rode o seguinte comando para iniciar:
```
npm start
```

Acesse no navegador: `http://localhost:3000` (ou a porta definida em `PORT`).

### Endpoints principais
- `GET /` → UI estática (arquivos em `public/`)
- `GET /api/health` → Checagem simples de saúde da API
- `POST /api/chat` → Endpoint de conversa (usa Groq se `GROQ_API_KEY` estiver configurada)

### Scrapers (opcional)
Existem scripts para coletar políticas/termos e salvar em `data/`:
```
npm run scrape           # coletor base
npm run scrape:terms
npm run scrape:privacy
npm run scrape:refund
npm run scrape:all       # executa todos
```

### Estrutura do projeto (resumo)
- `public/` UI (HTML/CSS/JS)
- `server/` servidor Express, rotas e serviços (`/api`)
- `data/` arquivos usados pelo servidor
- `scraper/` scripts para coleta de conteúdo
