import { create } from 'zustand';

/**
 * Retours utilisateur (toasts) et boîtes de dialogue impératives, à la place
 * de alert() / confirm() / prompt() du navigateur. Utilisables hors React :
 *
 *   toast.success('Carte enregistrée');
 *   if (!(await confirmDialog({ title: 'Supprimer ?', danger: true }))) return;
 *   const v = await promptDialog({ title: 'Prix', inputMode: 'decimal' });
 *
 * Le rendu est assuré par <FeedbackHost /> (monté une fois à la racine).
 */

export type ToastTone = 'neutral' | 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  /** ms ; 0 = reste affiché jusqu'à fermeture. */
  duration: number;
}

interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

interface PromptRequest {
  kind: 'prompt';
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue: string;
  confirmLabel: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
  suffix?: string;
  /** Retourne un message d'erreur, ou null si la valeur est acceptée. */
  validate?: (value: string) => string | null;
  resolve: (value: string | null) => void;
}

export type DialogRequest = ConfirmRequest | PromptRequest;

interface FeedbackStore {
  toasts: Toast[];
  dialog: DialogRequest | null;
  push: (t: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
  openDialog: (d: DialogRequest) => void;
  closeDialog: () => void;
}

let nextId = 1;

export const useFeedback = create<FeedbackStore>((set, get) => ({
  toasts: [],
  dialog: null,
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openDialog: (d) => {
    // Une seule boîte à la fois : une demande en cours est annulée.
    const current = get().dialog;
    if (current?.kind === 'confirm') current.resolve(false);
    else if (current?.kind === 'prompt') current.resolve(null);
    set({ dialog: d });
  },
  closeDialog: () => set({ dialog: null }),
}));

type ToastOptions = Partial<Pick<Toast, 'description' | 'action' | 'duration'>>;

function show(tone: ToastTone, message: string, opts: ToastOptions = {}) {
  return useFeedback.getState().push({
    tone,
    message,
    description: opts.description,
    action: opts.action,
    duration: opts.duration ?? (opts.action ? 6000 : tone === 'error' ? 6000 : 3500),
  });
}

export const toast = Object.assign((message: string, opts?: ToastOptions) => show('neutral', message, opts), {
  success: (message: string, opts?: ToastOptions) => show('success', message, opts),
  error: (message: string, opts?: ToastOptions) => show('error', message, opts),
  info: (message: string, opts?: ToastOptions) => show('info', message, opts),
  dismiss: (id: number) => useFeedback.getState().dismiss(id),
});

export function confirmDialog(opts: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useFeedback.getState().openDialog({
      kind: 'confirm',
      title: opts.title,
      description: opts.description,
      confirmLabel: opts.confirmLabel ?? (opts.danger ? 'Supprimer' : 'Confirmer'),
      cancelLabel: opts.cancelLabel ?? 'Annuler',
      danger: opts.danger ?? false,
      resolve,
    });
  });
}

export function promptDialog(opts: {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  inputMode?: 'text' | 'decimal' | 'numeric';
  suffix?: string;
  validate?: (value: string) => string | null;
}): Promise<string | null> {
  return new Promise((resolve) => {
    useFeedback.getState().openDialog({
      kind: 'prompt',
      title: opts.title,
      description: opts.description,
      label: opts.label,
      placeholder: opts.placeholder,
      defaultValue: opts.defaultValue ?? '',
      confirmLabel: opts.confirmLabel ?? 'Valider',
      inputMode: opts.inputMode,
      suffix: opts.suffix,
      validate: opts.validate,
      resolve,
    });
  });
}

/** Message lisible depuis une erreur inconnue. */
export function errorMessage(e: unknown, fallback = 'Une erreur est survenue.'): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
