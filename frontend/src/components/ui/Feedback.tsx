import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useFeedback, type DialogRequest, type Toast } from '../../lib/feedback';
import { Modal } from './index';

const TONE: Record<Toast['tone'], { icon: typeof Info | null; color: string }> = {
  neutral: { icon: null, color: 'var(--text-secondary)' },
  success: { icon: CheckCircle2, color: 'var(--green)' },
  error: { icon: AlertCircle, color: 'var(--red)' },
  info: { icon: Info, color: 'var(--blue)' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useFeedback((s) => s.dismiss);
  const [paused, setPaused] = useState(false);
  const { icon: Icon, color } = TONE[toast.tone];

  // Un toast avec action (ex. « Annuler ») suit un délai côté métier : il ne se
  // met pas en pause au survol, sinon le bouton resterait affiché après expiration.
  const pausable = !toast.action;
  useEffect(() => {
    if (!toast.duration || (paused && pausable)) return;
    const t = window.setTimeout(() => dismiss(toast.id), toast.duration);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.duration, paused, pausable, dismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', damping: 30, stiffness: 400 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="popover-surface pointer-events-auto flex w-full max-w-sm items-start gap-3 px-3.5 py-3"
    >
      {Icon && <Icon size={17} className="mt-px shrink-0" style={{ color }} />}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[var(--text-primary)]">{toast.message}</p>
        {toast.description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{toast.description}</p>}
      </div>
      {toast.action && (
        <button
          className="shrink-0 rounded-md px-2 py-0.5 text-[13px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-dim)]"
          onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        className="-mr-1 shrink-0 rounded-md p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        onClick={() => dismiss(toast.id)}
        aria-label="Fermer la notification"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

function PromptBody({ dialog, onDone }: { dialog: Extract<DialogRequest, { kind: 'prompt' }>; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(dialog.defaultValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit() {
    const err = dialog.validate?.(value) ?? null;
    if (err) { setError(err); return; }
    onDone(value);
  }

  return (
    <Modal
      onClose={() => onDone(null)}
      title={dialog.title}
      subtitle={dialog.description}
      size="sm"
      zIndex={130}
      footer={
        <>
          <button className="ui-btn" onClick={() => onDone(null)}>Annuler</button>
          <button className="ui-btn ui-btn-primary" onClick={submit}>{dialog.confirmLabel}</button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="block space-y-1.5">
          {dialog.label && <span className="block text-xs font-medium text-[var(--text-secondary)]">{dialog.label}</span>}
          <div className="relative">
            <input
              ref={inputRef}
              value={value}
              inputMode={dialog.inputMode}
              placeholder={dialog.placeholder}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              className={`ui-input tabular ${dialog.suffix ? 'pr-8' : ''}`}
              aria-invalid={!!error}
            />
            {dialog.suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[var(--text-muted)]">{dialog.suffix}</span>}
          </div>
          {error && <span className="block text-xs text-[var(--red)]">{error}</span>}
        </label>
      </form>
    </Modal>
  );
}

/** Toasts + boîte de dialogue en cours. À monter une seule fois, à la racine. */
export function FeedbackHost() {
  const toasts = useFeedback((s) => s.toasts);
  const dialog = useFeedback((s) => s.dialog);
  const closeDialog = useFeedback((s) => s.closeDialog);

  function finishConfirm(ok: boolean) {
    if (dialog?.kind === 'confirm') dialog.resolve(ok);
    closeDialog();
  }
  function finishPrompt(v: string | null) {
    if (dialog?.kind === 'prompt') dialog.resolve(v);
    closeDialog();
  }

  return (
    <>
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-[140] flex flex-col items-center gap-2 px-3 lg:bottom-5 lg:items-end lg:px-5"
        >
          <AnimatePresence initial={false}>
            {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
          </AnimatePresence>
        </div>,
        document.body,
      )}

      {dialog?.kind === 'confirm' && (
        <Modal
          onClose={() => finishConfirm(false)}
          title={dialog.title}
          size="sm"
          zIndex={130}
          bodyClassName={dialog.description ? '' : 'hidden'}
          icon={dialog.danger ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--red) 14%, transparent)', color: 'var(--red)' }}>
              <AlertCircle size={17} />
            </span>
          ) : undefined}
          footer={
            <>
              <button className="ui-btn" onClick={() => finishConfirm(false)}>{dialog.cancelLabel}</button>
              <button
                autoFocus
                className={dialog.danger ? 'ui-btn ui-btn-danger-solid' : 'ui-btn ui-btn-primary'}
                onClick={() => finishConfirm(true)}
              >
                {dialog.confirmLabel}
              </button>
            </>
          }
        >
          {dialog.description && <p className="whitespace-pre-line text-[13px] leading-relaxed text-[var(--text-secondary)]">{dialog.description}</p>}
        </Modal>
      )}

      {dialog?.kind === 'prompt' && <PromptBody key={dialog.title} dialog={dialog} onDone={finishPrompt} />}
    </>
  );
}
