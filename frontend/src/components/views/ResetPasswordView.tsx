import { useState, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Field, Notice } from '../ui';

/** Mise en page centrée des écrans d'authentification (logo + carte). */
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg-primary)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent)] text-lg font-extrabold text-[var(--on-accent)]">
            C
          </div>
          <p className="text-xl font-bold tracking-tight text-[var(--text-primary)]">CardVaults</p>
        </div>
        <div className="ui-card p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

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
    <AuthShell>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--green)]"
          style={{ background: 'color-mix(in srgb, var(--green) 12%, transparent)' }}
        >
          <CheckCircle2 size={22} />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-[var(--text-primary)]">Mot de passe mis à jour !</h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Tu peux maintenant accéder à ta collection.</p>
        </div>
        <button onClick={onDone} className="ui-btn ui-btn-primary ui-btn-lg mt-2 w-full">
          Accéder à l'application
        </button>
      </div>
    </AuthShell>
  );

  return (
    <AuthShell>
      <div className="mb-5">
        <h1 className="text-[15px] font-semibold text-[var(--text-primary)]">Nouveau mot de passe</h1>
        <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">8 caractères minimum.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nouveau mot de passe">
          <input type="password" placeholder="Nouveau mot de passe" value={password}
            onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className="ui-input" />
        </Field>
        <Field label="Confirmation">
          <input type="password" placeholder="Confirmer le mot de passe" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" className="ui-input" />
        </Field>

        {error && <Notice tone="error">{error}</Notice>}

        <button type="submit" disabled={loading} className="ui-btn ui-btn-primary ui-btn-lg w-full">
          {loading ? 'Enregistrement…' : 'Mettre à jour'}
        </button>
      </form>
    </AuthShell>
  );
}
