import { useState, type ReactNode } from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Field, Notice } from '../ui';

function Logo() {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-lg font-extrabold text-[var(--on-accent)]">
        C
      </div>
      <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">CardVaults</h1>
      <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Gère ta collection</p>
    </div>
  );
}

/** Carte centrée des écrans d'authentification. */
function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-card p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {children}
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
    <AuthCard title="Vérifie ta boîte mail">
      <div className="space-y-4">
        <Notice tone="success" icon={MailCheck}>Email envoyé ! Vérifie ta boîte mail.</Notice>
        <button onClick={onBack} className="ui-btn ui-btn-ghost w-full">
          <ArrowLeft size={15} /> Retour
        </button>
      </div>
    </AuthCard>
  );

  return (
    <AuthCard title="Mot de passe oublié" subtitle="Saisis ton email pour recevoir un lien de réinitialisation.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email">
          <input
            type="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)}
            required autoComplete="email" className="ui-input"
          />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <button type="submit" disabled={loading} className="ui-btn ui-btn-primary ui-btn-lg w-full">
          {loading ? 'Envoi…' : 'Envoyer le lien'}
        </button>
        <button type="button" onClick={onBack} className="ui-btn ui-btn-ghost w-full">
          <ArrowLeft size={15} /> Retour à la connexion
        </button>
      </form>
    </AuthCard>
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
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg-primary)] px-4 py-10">
      <div className="w-full max-w-sm">
        <Logo />

        {showForgot ? (
          <ForgotPasswordForm onBack={() => setShowForgot(false)} />
        ) : (
          <AuthCard title="Connexion" subtitle="Connecte-toi pour retrouver ta collection.">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email">
                <input type="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)}
                  required autoComplete="email" className="ui-input" />
              </Field>
              <Field label="Mot de passe">
                <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)}
                  required autoComplete="current-password" className="ui-input" />
              </Field>

              {error && <Notice tone="error">{error}</Notice>}

              <button type="submit" disabled={loading} className="ui-btn ui-btn-primary ui-btn-lg w-full">
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>

              <div className="text-center">
                <button type="button" onClick={() => setShowForgot(true)} className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                  Mot de passe oublié ?
                </button>
              </div>
            </form>
          </AuthCard>
        )}
      </div>
    </div>
  );
}
