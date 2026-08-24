import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

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

  return (
    <div className="min-h-screen p-6 flex justify-center" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="w-full max-w-xl space-y-5 pt-10">
        <div>
          <h1 className="text-2xl font-bold">CardVaults Scout</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>Autorise une extension Chrome sans lui transmettre ton mot de passe.</p>
        </div>
        <form onSubmit={approve} className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <label className="block text-sm font-semibold">Code affiché dans l’extension</label>
          <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))}
            className="w-full rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[.35em] outline-none"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          <button disabled={loading || code.length !== 6} className="w-full rounded-xl py-3 font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#111' }}>
            {loading ? 'Validation…' : 'Autoriser cette extension'}
          </button>
          {message && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>}
        </form>
        <section className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="font-bold mb-3">Extensions connectées</h2>
          {tokens.filter((token) => !token.revoked_at).length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucune extension active.</p>}
          {tokens.filter((token) => !token.revoked_at).map((token) => (
            <div key={token.id} className="flex items-center justify-between gap-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <div><div className="text-sm font-semibold">{token.label}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>Dernière utilisation : {token.last_used_at ? new Date(token.last_used_at).toLocaleString('fr-FR') : 'jamais'}</div></div>
              <button onClick={() => revoke(token.id)} className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--red)', background: 'var(--bg-elevated)' }}>Révoquer</button>
            </div>
          ))}
        </section>
        <button onClick={() => { window.location.href = '/'; }} className="text-sm underline" style={{ color: 'var(--text-secondary)' }}>Retour à CardVaults</button>
      </div>
    </div>
  );
}
