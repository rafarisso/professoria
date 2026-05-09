function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

function normalizeEndpoint(value) {
  return (value || '').trim().replace(/\/+$/, '');
}

function foundryUrl(endpoint, path) {
  return `${endpoint}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readError(response) {
  const raw = await response.text();

  if (!raw) return `${response.status} ${response.statusText}`.trim();

  try {
    const parsed = JSON.parse(raw);
    return (
      parsed?.error?.message ||
      parsed?.message ||
      parsed?.error ||
      `${response.status} ${response.statusText}`
    );
  } catch {
    return raw;
  }
}

async function ensureOk(response, context) {
  if (response.ok) return response;
  throw new Error(`${context}: ${await readError(response)}`);
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  const output = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of output) {
    if (typeof item?.content === 'string') {
      chunks.push(item.content);
      continue;
    }

    if (!Array.isArray(item?.content)) continue;

    for (const content of item.content) {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.text?.value === 'string') chunks.push(content.text.value);
      if (typeof content?.content === 'string') chunks.push(content.content);
    }
  }

  return chunks.join('\n').trim();
}

async function createConversation(endpoint, headers) {
  const response = await fetch(foundryUrl(endpoint, '/openai/v1/conversations'), {
    method: 'POST',
    headers,
    body: '{}'
  });

  await ensureOk(response, 'Erro ao criar conversa no Foundry');
  const conversation = await response.json();

  if (!conversation?.id) {
    throw new Error('O Foundry nao retornou o ID da conversa.');
  }

  return conversation.id;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'JSON invalido.' });
  }

  const question = body?.question?.toString()?.trim();
  const incomingConversationId = body?.conversationId || body?.threadId || null;

  if (!question) {
    return json(400, { error: 'Pergunta nao enviada.' });
  }

  const endpoint = normalizeEndpoint(process.env.AZURE_FOUNDRY_ENDPOINT);
  const apiKey = process.env.AZURE_FOUNDRY_KEY;
  const agentName = process.env.AZURE_FOUNDRY_AGENT_NAME || process.env.AZURE_FOUNDRY_AGENT_ID;

  if (!endpoint || !apiKey || !agentName) {
    return json(500, {
      error:
        'Configure AZURE_FOUNDRY_ENDPOINT, AZURE_FOUNDRY_KEY e AZURE_FOUNDRY_AGENT_NAME no Netlify. Se voce ja usa AZURE_FOUNDRY_AGENT_ID, ele tambem e aceito como nome legado do agente.'
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'api-key': apiKey
  };

  try {
    const conversationId =
      incomingConversationId || (await createConversation(endpoint, headers));

    const response = await fetch(foundryUrl(endpoint, '/openai/v1/responses'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agent_reference: {
          type: 'agent_reference',
          name: agentName
        },
        conversation: conversationId,
        input: [
          {
            role: 'user',
            content: question
          }
        ]
      })
    });

    await ensureOk(response, 'Erro ao chamar agente no Foundry');
    const payload = await response.json();
    const answer = extractOutputText(payload);

    if (!answer) {
      throw new Error('Resposta invalida do agente.');
    }

    return json(200, {
      answer,
      threadId: conversationId,
      conversationId
    });
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : 'Erro desconhecido.'
    });
  }
}
