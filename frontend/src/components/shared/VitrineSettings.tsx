import { useEffect, useState } from 'react';
import { Loader2, Settings2, Sparkles } from 'lucide-react';
import { useCards } from '../../hooks/useCards';
import { useVitrineBackdrops } from '../../hooks/useVitrineBackdrops';
import { cdnImg } from '../../lib/cdn';
import { VITRINE_STYLE_LABELS, makeVitrine, useVitrine } from '../../lib/vitrine';
import { useVitrineSettingsModal } from '../../stores/vitrineSettingsStore';
import { Modal } from '../ui';
import { VitrineControls } from './VitrineControls';

/**
 * Réglages « Photos vitrine » du compte, en un seul endroit (menu du compte,
 * palette ⌘K, lien « Réglages » des écrans photo), avec un aperçu en direct
 * sur une carte de la collection.
 */
export function VitrineSettingsModal() {
  const { open, setOpen } = useVitrineSettingsModal();
  const vitrine = useVitrine();
  const { data: backdrops } = useVitrineBackdrops();
  const { data: cards = [] } = useCards();
  const sample = cards.find((c) => c.status !== 'draft' && c.image_front_url);
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const backdropUrl = vitrine.style === 'backdrop' ? backdrops?.[vitrine.tone]?.url ?? null : null;
  const key = `${sample?.id}|${vitrine.style}|${vitrine.tone}|${vitrine.signature.trim()}|${backdropUrl ?? ''}`;

  useEffect(() => {
    if (!open || !vitrine.enabled || !sample?.image_front_url) return;
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const photo = await (await fetch(cdnImg(sample.image_front_url)!)).blob();
        const out = await makeVitrine(photo, { style: vitrine.style, tone: vitrine.tone, signature: vitrine.signature, backdropUrl, fallback: 'whole' });
        if (alive) setPreview({ key, url: URL.createObjectURL(out) });
      } catch {
        /* aperçu indisponible : les réglages restent utilisables */
      }
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
    // La clé résume tout ce qui change l'aperçu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, vitrine.enabled]);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Photos vitrine"
      subtitle="Appliqué aux nouvelles cartes (scan, ajout rapide, Studio). Tes cartes déjà en collection ne sont pas modifiées."
      icon={<Sparkles size={18} className="text-[var(--violet)]" />}
      size="lg"
      footer={<button className="ui-btn ui-btn-primary" onClick={() => setOpen(false)}>Terminé</button>}
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
        <VitrineControls />
        <div className="order-first sm:order-none">
          <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Aperçu</p>
          <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            {!vitrine.enabled ? (
              <p className="px-4 text-center text-xs text-[var(--text-muted)]">Active la photo vitrine pour voir l'aperçu</p>
            ) : preview?.key === key ? (
              <img src={preview.url} alt="Aperçu de la photo vitrine" className="h-full w-full object-cover" />
            ) : (
              <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Ligne compacte pour les écrans photo : état + raccourci vers les réglages. */
export function VitrineSummary() {
  const { enabled, style, tone, signature, set } = useVitrine();
  const openSettings = useVitrineSettingsModal((s) => s.setOpen);
  const summary = [VITRINE_STYLE_LABELS[style], tone === 'dark' ? 'sombre' : 'clair', signature.trim()].filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] px-3 py-2.5">
      <Sparkles size={16} className="shrink-0 text-[var(--violet)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[var(--text-primary)]">Photo vitrine</span>
        <span className="block truncate text-xs text-[var(--text-muted)]">{enabled ? summary : 'Désactivée · photo telle quelle'}</span>
      </span>
      <button className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => openSettings(true)} title="Réglages des photos vitrine">
        <Settings2 size={14} /> Réglages
      </button>
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
  );
}
