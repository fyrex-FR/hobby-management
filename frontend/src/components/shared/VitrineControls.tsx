import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useVitrineBackdrops } from '../../hooks/useVitrineBackdrops';
import { ImagePlus, Loader2, Moon, Sparkles, Sun, Trash2 } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { supabase } from '../../lib/supabase';
import { cdnImg } from '../../lib/cdn';
import { errorMessage, toast } from '../../lib/feedback';
import { VITRINE_STYLE_LABELS, fetchBackdrops, useVitrine, type VitrineStyle } from '../../lib/vitrine';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Réglages « Photo vitrine » du compte : activé, style, ton, pseudo gravé, fond perso. */
export function VitrineControls({ compact = false }: { compact?: boolean }) {
  const { enabled, style, tone, signature, set } = useVitrine();
  const { data: backdrops } = useVitrineBackdrops();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const current = backdrops?.[tone] ?? null;

  // « Mon fond » n'apparaît que si un fond a été envoyé pour ce ton.
  const styles: VitrineStyle[] = current ? ['studio', 'stand', 'backdrop'] : ['studio', 'stand'];
  const shownStyle = styles.includes(style) ? style : 'stand';

  async function refresh() {
    await fetchBackdrops(true);
    await qc.invalidateQueries({ queryKey: ['vitrine-backdrops'] });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const form = new FormData();
      form.append('file', file);
      form.append('tone', tone);
      const resp = await fetch(`${API_BASE}/api/vitrine/backdrop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: form,
      });
      if (resp.status === 404) throw new Error('Le serveur doit être mis à jour pour accepter les fonds personnalisés.');
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.detail ?? `Erreur ${resp.status}`);
      await refresh();
      set({ style: 'backdrop' });
      toast.success(`Fond ${tone === 'dark' ? 'sombre' : 'clair'} enregistré`);
    } catch (e) {
      toast.error('Envoi du fond impossible', { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch<void>(`/vitrine/backdrop/${tone}`, { method: 'DELETE' });
      await refresh();
      if (style === 'backdrop') set({ style: 'stand' });
      toast.success('Fond supprimé');
    } catch (e) {
      toast.error('Suppression impossible', { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-2xl border border-[var(--border)] ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center gap-3">
        <Sparkles size={16} className="shrink-0 text-[var(--violet)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-[var(--text-primary)]">Photo vitrine</span>
          <span className="block text-xs text-[var(--text-muted)]">Carte détourée et posée sur un fond propre</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Photo vitrine"
          onClick={() => set({ enabled: !enabled })}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${enabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-hover)]'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>

      {enabled && (
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="ui-segmented" role="radiogroup" aria-label="Style">
              {styles.map((s) => (
                <button key={s} role="radio" aria-checked={shownStyle === s} data-active={shownStyle === s} onClick={() => set({ style: s })}>
                  {VITRINE_STYLE_LABELS[s]}
                </button>
              ))}
            </div>
            <div className="ui-segmented" role="radiogroup" aria-label="Ton">
              <button role="radio" aria-checked={tone === 'dark'} data-active={tone === 'dark'} onClick={() => set({ tone: 'dark' })} aria-label="Fond sombre" title="Fond sombre"><Moon size={14} /></button>
              <button role="radio" aria-checked={tone === 'light'} data-active={tone === 'light'} onClick={() => set({ tone: 'light' })} aria-label="Fond clair" title="Fond clair"><Sun size={14} /></button>
            </div>
            <input
              value={signature}
              onChange={(e) => set({ signature: e.target.value.slice(0, 24) })}
              placeholder="@ton_pseudo"
              aria-label="Pseudo gravé sur la photo"
              className="ui-input h-8 w-36 min-w-0 flex-1 text-xs"
            />
          </div>

          {/* Fond personnalisé du compte (ton courant) */}
          <div className="flex items-center gap-2.5">
            {current ? (
              <>
                <img src={cdnImg(current.url)} alt="" className="h-10 w-8 shrink-0 rounded-md object-cover ring-1 ring-[var(--border)]" />
                <span className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">Ton fond {tone === 'dark' ? 'sombre' : 'clair'}</span>
                <button className="ui-btn ui-btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Changer
                </button>
                <button className="ui-btn ui-btn-sm ui-btn-icon ui-btn-danger" onClick={remove} disabled={busy} aria-label="Supprimer le fond" title="Supprimer le fond">
                  <Trash2 size={13} />
                </button>
              </>
            ) : (
              <button className="text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-50" onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? 'Envoi…' : `+ Importer ton fond ${tone === 'dark' ? 'sombre' : 'clair'} (image IA, format portrait)`}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>
      )}
    </div>
  );
}
