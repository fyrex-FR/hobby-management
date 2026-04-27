import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const inputClass = 'w-full rounded-xl px-4 py-3 text-sm outline-none transition-all';
const inputStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

function Logo() {
  return (
    <div className="flex flex-col items-center mb-10">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black mb-4"
        style={{ background: 'var(--accent)', color: '#0d0c0b', boxShadow: '0 0 40px var(--accent-glow)' }}
      >C</div>
      <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>CardVaults</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Gère ta collection</p>
    </div>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  }

  if (sent) return (
    <div className="text-center space-y-4">
      <p className="text-2xl">📬</p>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Email envoyé ! Vérifie ta boîte mail.</p>
      <button onClick={onBack} className="text-xs" style={{ color: 'var(--text-muted)' }}>← Retour</button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Saisis ton email pour recevoir un lien de réinitialisation.
      </p>
      <input
        type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
        required className={inputClass} style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = 'rgba(245,166,35,0.4)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
      />
      {error && <p className="text-sm px-1" style={{ color: 'var(--red)' }}>{error}</p>}
      <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold transition-all"
        style={{ background: loading ? 'var(--bg-elevated)' : 'var(--accent)', color: loading ? 'var(--text-muted)' : '#0d0c0b' }}>
        {loading ? 'Envoi…' : 'Envoyer le lien'}
      </button>
      <button type="button" onClick={onBack} className="w-full py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        ← Retour à la connexion
      </button>
    </form>
  );
}

export function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(245,166,35,0.06) 0%, transparent 70%)' }} />

      <div className="relative w-full max-w-sm">
        <Logo />

        {showForgot ? (
          <ForgotPasswordForm onBack={() => setShowForgot(false)} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              required className={inputClass} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(245,166,35,0.4)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')} />
            <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)}
              required className={inputClass} style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(245,166,35,0.4)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')} />

            {error && <p className="text-sm px-1" style={{ color: 'var(--red)' }}>{error}</p>}

            <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold transition-all mt-2"
              style={{ background: loading ? 'var(--bg-elevated)' : 'var(--accent)', color: loading ? 'var(--text-muted)' : '#0d0c0b', boxShadow: loading ? 'none' : '0 0 30px var(--accent-glow)' }}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>

            <button type="button" onClick={() => setShowForgot(true)} className="w-full py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Mot de passe oublié ?
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
