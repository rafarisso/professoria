const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 15;
const API_VERSION = process.env.AZURE_FOUNDRY_API_VERSION || 'v1';

function withApiVersion(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}api-version=${encodeURIComponent(API_VERSION)}`;
}

async function getBearerToken() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://ai.azure.com/.default'
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  if (!res.ok) throw new Error(`Erro ao obter token Azure AD: ${await res.text()}`);
  return (await res.json()).access_token;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido.' }) };
  }

  const question = body?.question?.toString()?.trim();
  const incomingThreadId = body?.threadId || null;

  if (!question) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Pergunta não enviada.' }) };
  }

  const endpoint = (process.env.AZURE_FOUNDRY_ENDPOINT || '').replace(/\/+$/, '');
  const agentId = process.env.AZURE_FOUNDRY_AGENT_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!endpoint || !agentId) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Configure AZURE_FOUNDRY_ENDPOINT e AZURE_FOUNDRY_AGENT_ID no Netlify.'
      })
    };
  }

  if (!tenantId || !clientId || !clientSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Configure AZURE_TENANT_ID, AZURE_CLIENT_ID e AZURE_CLIENT_SECRET no Netlify.'
      })
    };
  }

  try {
    const token = await getBearerToken();
    const base = `${endpoint}/agents/v1.0`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 1. Create or reuse thread
    let threadId = incomingThreadId;
    if (!threadId) {
      const res = await fetch(withApiVersion(`${base}/threads`), {
        method: 'POST',
        headers,
        body: '{}'
      });
      if (!res.ok) throw new Error(`Erro ao criar thread: ${await res.text()}`);
      threadId = (await res.json()).id;
    }

    // 2. Add user message to thread
    const msgRes = await fetch(withApiVersion(`${base}/threads/${threadId}/messages`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ role: 'user', content: question })
    });
    if (!msgRes.ok) throw new Error(`Erro ao enviar mensagem: ${await msgRes.text()}`);

    // 3. Run the agent
    const runRes = await fetch(withApiVersion(`${base}/threads/${threadId}/runs`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ assistant_id: agentId })
    });
    if (!runRes.ok) throw new Error(`Erro ao iniciar execução: ${await runRes.text()}`);
    const run = await runRes.json();
    let status = run.status;
    const runId = run.id;

    // 4. Poll until done
    let polls = 0;
    while (
      !['completed', 'failed', 'cancelled', 'expired'].includes(status) &&
      polls < MAX_POLLS
    ) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const pollRes = await fetch(
        withApiVersion(`${base}/threads/${threadId}/runs/${runId}`),
        { headers }
      );
      if (!pollRes.ok) throw new Error(`Erro ao verificar execução: ${await pollRes.text()}`);
      status = (await pollRes.json()).status;
      polls++;
    }

    if (status !== 'completed') {
      throw new Error(`Execução encerrada com status: ${status}`);
    }

    // 5. Get latest assistant message
    const msgsRes = await fetch(
      withApiVersion(`${base}/threads/${threadId}/messages?order=desc&limit=1`),
      { headers }
    );
    if (!msgsRes.ok) throw new Error(`Erro ao buscar resposta: ${await msgsRes.text()}`);
    const msgs = await msgsRes.json();
    const answer = msgs.data?.[0]?.content?.[0]?.text?.value;
    if (!answer) throw new Error('Resposta inválida do agente.');

    return {
      statusCode: 200,
      body: JSON.stringify({ answer, threadId })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Erro desconhecido.' })
    };
  }
}
