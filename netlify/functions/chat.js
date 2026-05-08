const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 15;

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
  const apiKey = process.env.AZURE_FOUNDRY_KEY;
  const agentId = process.env.AZURE_FOUNDRY_AGENT_ID;

  if (!endpoint || !apiKey || !agentId) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          'Configure AZURE_FOUNDRY_ENDPOINT, AZURE_FOUNDRY_KEY e AZURE_FOUNDRY_AGENT_ID no Netlify.'
      })
    };
  }

  const base = `${endpoint}/agents/v1.0`;
  const headers = {
    'Content-Type': 'application/json',
    'api-key': apiKey
  };

  try {
    // 1. Create or reuse thread for conversation continuity
    let threadId = incomingThreadId;
    if (!threadId) {
      const res = await fetch(`${base}/threads`, { method: 'POST', headers, body: '{}' });
      if (!res.ok) throw new Error(`Erro ao criar thread: ${await res.text()}`);
      threadId = (await res.json()).id;
    }

    // 2. Add user message to thread
    const msgRes = await fetch(`${base}/threads/${threadId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ role: 'user', content: question })
    });
    if (!msgRes.ok) throw new Error(`Erro ao enviar mensagem: ${await msgRes.text()}`);

    // 3. Run the agent
    const runRes = await fetch(`${base}/threads/${threadId}/runs`, {
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
      const pollRes = await fetch(`${base}/threads/${threadId}/runs/${runId}`, { headers });
      if (!pollRes.ok) throw new Error(`Erro ao verificar execução: ${await pollRes.text()}`);
      status = (await pollRes.json()).status;
      polls++;
    }

    if (status !== 'completed') {
      throw new Error(`Execução encerrada com status: ${status}`);
    }

    // 5. Get latest assistant message
    const msgsRes = await fetch(
      `${base}/threads/${threadId}/messages?order=desc&limit=1`,
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
