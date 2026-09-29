import { useEffect, useState } from 'react';
import { ArrowLeft, Puzzle } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { Notice, Panel } from '../ui';

interface ExtensionToken {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  revoked_at: string | null;
}

export function ExtensionPairView() {
  const initialCode = new URLSearchParams(window.location.search).get('code')?.toUpperCase() || '';
  const [code, setCode] = useState(initialCode);
  const [tokens, setTokens] = useState<ExtensionToken[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadTokens() {
    setTokens(await apiFetch<ExtensionToken[]>('/extension/tokens'));
  }

  useEffect(() => { loadTokens().catch(() => {}); }, []);

  async function approve(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setMessage('');
    try {
      await apiFetch('/extension/pairings/approve', { method: 'POST', body: JSON.stringify({ code }) });
      setMessage('Extension approuvée. Tu peux revenir dans le panneau Chrome.');
      await loadTokens();
    } catch (error) {
      setMessage((error as Error).message);
    } finally { setLoading(false); }
  }

  async function revoke(id: string) {
    await apiFetch(`/extension/tokens/${id}`, { method: 'DELETE' });
    await loadTokens();
  }

  const activeTokens = tokens.filter((token) => !token.revoked_at);
  // Le message est soit la confirmation fixe, soit un message d'erreur de l'API.
  const approved = message === 'Extension approuvée. Tu peux revenir dans le panneau Chrome.';

  return (
    <div className="flex min-h-[100dvh] justify-center bg-[var(--bg-primary)] px-4 py-10 text-[var(--text-primary)]">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-lg font-extrabold text-[var(--on-accent)]">
            C
          </div>
          <h1 className="text-xl font-semibold tracking-tight">CardVaults Scout</h1>
          <p className="mt-1 max-w-xs text-[13px] text-[var(--text-muted)]">Autorise une extension Chrome sans lui transmettre ton mot de passe.</p>
        </div>

        <form onSubmit={approve} className="ui-card space-y-4 p-5">
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">Code affiché dans l’extension</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="ABC234"
              className="ui-input h-14 text-center font-mono text-2xl tracking-[.35em] placeholder:tracking-[.35em]"
            />
          </label>
          <button disabled={loading || code.length !== 6} className="ui-btn ui-btn-primary ui-btn-lg w-full">
            {loading ? 'Validation…' : 'Autoriser cette extension'}
          </button>
          {message && <Notice tone={approved ? 'success' : 'error'}>{message}</Notice>}
        </form>

        <Panel title="Extensions connectées" icon={Puzzle} padded={activeTokens.length === 0}>
          {activeTokens.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">Aucune extension active.</p>}
          {activeTokens.length > 0 && (
            <ul className="divide-y divide-[var(--border)]">
              {activeTokens.map((token) => (
                <li key={token.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{token.label}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Dernière utilisation : {token.last_used_at ? new Date(token.last_used_at).toLocaleString('fr-FR') : 'jamais'}
                    </div>
                  </div>
                  <button onClick={() => revoke(token.id)} className="ui-btn ui-btn-sm ui-btn-danger shrink-0">Révoquer</button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="text-center">
          <button onClick={() => { window.location.href = '/'; }} className="ui-btn ui-btn-ghost">
            <ArrowLeft size={15} /> Retour à CardVaults
          </button>
        </div>
      </div>
    </div>
  );
}
