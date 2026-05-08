import { useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

const SUGGESTIONS = [
  'O que são biomas brasileiros?',
  'Quais são os maiores países do mundo?',
  'Como funciona o ciclo da água?',
  'O que causa as estações do ano?'
];

function getTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const INITIAL: Message[] = [
  {
    role: 'assistant',
    content:
      'Olá! Sou seu Professor IA de Geografia, disponível 24h. Pergunte o que quiser sobre mapas, países, clima, biomas e regiões do Brasil e do mundo.',
    time: getTime()
  }
];

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
      <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
    </svg>
  );
}

function App() {
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(text?: string) {
    const trimmed = (text ?? question).trim();
    if (!trimmed || loading) return;

    setError('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, time: getTime() }]);
    setQuestion('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, threadId })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || 'Erro ao conectar com o servidor');
      }

      const data = await response.json();
      if (data.threadId) setThreadId(data.threadId);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || 'Não recebi resposta do agente.',
          time: getTime()
        }
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const showSuggestions = messages.length === 1 && !loading;

  return (
    <div className="page-shell">
      <div className="wa-window">
        {/* Header */}
        <div className="wa-header">
          {avatarError ? (
            <div className="wa-avatar-fallback">🤖</div>
          ) : (
            <img
              src="/teacher-photo.png"
              alt="Professor IA"
              className="wa-avatar"
              onError={() => setAvatarError(true)}
            />
          )}
          <div className="wa-header-info">
            <strong>Professor IA</strong>
            <span>online</span>
          </div>
          <div className="wa-header-actions">
            <button className="wa-icon-btn" title="Pesquisar">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
            </button>
            <button className="wa-icon-btn" title="Menu">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="wa-chat">
          {messages.map((msg, i) => (
            <div key={i} className={`wa-bubble-wrap ${msg.role}`}>
              <div className="wa-bubble">
                <span className="wa-bubble-text">{msg.content}</span>
                <span className="wa-meta">
                  <span className="wa-time">{msg.time}</span>
                  {msg.role === 'user' && (
                    <span className="wa-ticks">
                      <svg viewBox="0 0 18 18" width="16" height="16" fill="#53bdeb">
                        <path d="M17.394 5.035l-.57-.444a.434.434 0 0 0-.609.076L8.089 15.097 4.069 9.87a.434.434 0 0 0-.608-.076l-.57.444a.434.434 0 0 0-.076.608l4.461 5.847a.434.434 0 0 0 .685 0l9.509-11.05a.434.434 0 0 0-.076-.608z" />
                        <path d="M14.394 5.035l-.57-.444a.434.434 0 0 0-.609.076L5.089 15.097l-.409-.536-.57.444-.076.608.685.898a.434.434 0 0 0 .685 0l9.509-11.05a.434.434 0 0 0-.076-.608l-.443-.818z" opacity=".5" />
                      </svg>
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="wa-bubble-wrap assistant">
              <div className="wa-bubble wa-typing-bubble">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {showSuggestions && (
          <div className="wa-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="wa-chip" onClick={() => handleSend(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && <div className="wa-error">{error}</div>}

        {/* Footer */}
        <div className="wa-footer">
          <button className="wa-icon-btn wa-emoji-btn">😊</button>
          <input
            ref={inputRef}
            className="wa-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Mensagem"
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
          />
          <button
            className="wa-send-btn"
            onClick={() => handleSend()}
            disabled={loading || !question.trim()}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
