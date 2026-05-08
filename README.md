# Professor IA — Geografia 24h

Chat educacional com IA conectado a um agente do **Microsoft Azure AI Foundry**, com pesquisa na web em tempo real. Interface no estilo WhatsApp dark mode, deploy serverless no **Netlify**.

---

## Funcionalidades

- Responde perguntas de Geografia 24h por dia via agente IA
- Pesquisa na web em tempo real (capability do agente Foundry)
- Histórico de conversa por sessão com `threadId` persistido
- Interface familiar no estilo WhatsApp dark mode
- Chips de sugestão para perguntas rápidas
- Horário e indicador de leitura (✓✓) em cada mensagem
- Indicador de digitação animado enquanto o agente responde
- Zero chaves secretas no front-end — tudo server-side via Netlify Function

---

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | React 18 + TypeScript + Vite |
| Estilo | CSS puro (tema WhatsApp dark) |
| Back-end | Netlify Functions (Node.js ≥ 18) |
| IA | Microsoft Azure AI Foundry — Agents API |
| Deploy | Netlify |

---

## Arquitetura

```
Navegador (React + Vite)
       │
       │  POST /api/chat  { question, threadId }
       ▼
Netlify Function ── netlify/functions/chat.js
       │
       │  api-key: AZURE_FOUNDRY_KEY  (nunca vai ao browser)
       ▼
Azure AI Foundry Agents API
  ├── POST /threads                   (cria conversa)
  ├── POST /threads/{id}/messages     (envia pergunta)
  ├── POST /threads/{id}/runs         (aciona agente)
  ├── GET  /threads/{id}/runs/{id}    (polling de status)
  └── GET  /threads/{id}/messages     (busca resposta)
       │
       ▼
  Agente IA (com ferramenta de busca na web)
```

O front-end **nunca** fala diretamente com o Azure. Toda autenticação ocorre dentro da Netlify Function, do lado do servidor.

---

## Estrutura do projeto

```
professor-ia/
├── src/
│   ├── App.tsx          # UI do chat (WhatsApp-style)
│   ├── styles.css       # Tema dark, bolhas, animações
│   ├── main.tsx         # Entry point React
│   └── vite-env.d.ts
├── netlify/
│   └── functions/
│       └── chat.js      # Proxy serverless → Azure Foundry
├── public/
│   └── teacher-photo.png
├── .env.example         # Modelo das variáveis de ambiente
├── netlify.toml         # Build + redirects + timeout
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Variáveis de ambiente

Cadastre as quatro variáveis abaixo em **Netlify → Site configuration → Environment variables**. Nenhuma delas deve ir ao front-end.

| Variável | Obrigatória | Secreta | Onde encontrar |
|---|---|---|---|
| `AZURE_FOUNDRY_ENDPOINT` | Sim | Não | Foundry → Página inicial → **Ponto de extremidade do projeto** |
| `AZURE_FOUNDRY_KEY` | Sim | **Sim** | Foundry → Página inicial → **Chave de API** |
| `AZURE_FOUNDRY_AGENT_ID` | Sim | Parcial | Foundry → **Agentes** → clique no agente → copie o ID (`asst_…`) |
| `AZURE_FOUNDRY_API_VERSION` | Não | Não | Use `2025-05-01-preview` (padrão já embutido no código) |

> **Formato do endpoint:** `https://XXXX.services.ai.azure.com/api/projects/NOME_DO_PROJETO`
>
> **Formato do agent ID:** `asst_xxxxxxxxxxxxxxxxxxxxxxxx`
>
> **Sobre a API version:** se omitida no Netlify, o código usa `2025-05-01-preview` automaticamente. Só defina esta variável se precisar forçar outra versão.

Para rodar localmente, copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
# Edite .env com seus valores reais
```

---

## Rodando localmente

### Pré-requisitos

- Node.js 18 ou superior
- Conta no Azure com um projeto Foundry e um agente configurado

### Instalação

```bash
# Clone o repositório
git clone https://github.com/rafarisso/professoria.git
cd professoria

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com seus valores do Azure Foundry

# Desenvolvimento com Netlify CLI (recomendado — roteia /api/chat igual à produção)
npm install -g netlify-cli
netlify dev

# Ou somente o Vite (sem a Netlify Function)
npm run dev
```

---

## Deploy no Netlify

### Via Git (recomendado)

1. Faça push do repositório para o GitHub
2. No Netlify: **Add new site → Import an existing project**
3. Selecione o repositório e configure:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Em **Environment variables**, adicione as 3 variáveis da tabela acima
5. Clique em **Deploy**

### Via CLI

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

---

## Como o chat funciona

```
1. Usuário digita a pergunta e pressiona Enter (ou clica no botão enviar)
2. React faz  POST /api/chat  com { question, threadId }
3. Netlify Function:
   a. Cria um thread (ou reutiliza o threadId recebido)
   b. Posta a mensagem do usuário no thread
   c. Inicia um "run" do agente
   d. Polling até status = "completed"  (máx. 15 × 1,5s = 22,5s)
   e. Busca a última mensagem do assistente
   f. Retorna { answer, threadId }
4. React exibe a resposta como bolha do assistente
```

O `threadId` é reutilizado entre mensagens para manter o contexto da conversa.

---

## Segurança

- `AZURE_FOUNDRY_KEY` existe **somente** em `netlify/functions/chat.js` via `process.env`
- Nenhuma variável usa prefixo `VITE_` (que exporia o valor no bundle do browser)
- O front-end chama **apenas** `/api/chat` — nunca o Azure diretamente
- `.env` e `.env.local` estão no `.gitignore`

---

## Personalização

**Trocar o agente:** altere `AZURE_FOUNDRY_AGENT_ID` nas variáveis do Netlify e faça redeploy.

**Alterar as sugestões de perguntas:** edite o array `SUGGESTIONS` em `src/App.tsx`:

```tsx
const SUGGESTIONS = [
  'O que são biomas brasileiros?',
  'Quais são os maiores países do mundo?',
  // adicione ou remova perguntas aqui
];
```

**Foto do professor:** substitua `public/teacher-photo.png` por uma imagem quadrada (mínimo 80×80 px).

---

## Licença

MIT © Rafa Risso
