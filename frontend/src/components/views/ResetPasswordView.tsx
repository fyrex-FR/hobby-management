import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const inputClass = 'w-full rounded-xl px-4 py-3 text-sm outline-none transition-all';
const inputStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

export function ResetPasswordView({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    if (password.length < 8) { setError('Minimum 8 caractères.'); return; }
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setDone(true);
    setLoading(false);
  }

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="text-center space-y-4">
        <p className="text-2xl">✓</p>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Mot de passe mis à jour !</p>
        <button
          onClick={onDone}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--accent)', color: '#0d0c0b' }}
        >
          Accéder à l'application
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black mb-4"
            style={{ background: 'var(--accent)', color: '#0d0c0b', boxShadow: '0 0 40px var(--accent-glow)' }}>N</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Nouveau mot de passe</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="password" placeholder="Nouveau mot de passe" value={password}
            onChange={(e) => setPassword(e.target.value)} required className={inputClass} style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(245,166,35,0.4)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')} />
          <input type="password" placeholder="Confirmer le mot de passe" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required className={inputClass} style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(245,166,35,0.4)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')} />

          {error && <p className="text-sm px-1" style={{ color: 'var(--red)' }}>{error}</p>}

          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold transition-all"
            style={{ background: loading ? 'var(--bg-elevated)' : 'var(--accent)', color: loading ? 'var(--text-muted)' : '#0d0c0b' }}>
            {loading ? 'Enregistrement…' : 'Mettre à jour'}
          </button>
        </form>
      </div>
    </div>
  );
}
