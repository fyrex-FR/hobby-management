import { useMemo, useState } from 'react';
import { X, Download, AlertCircle } from 'lucide-react';
import {
  WHATNOT_CONDITIONS,
  WHATNOT_DEFAULTS,
  WHATNOT_SHIPPING_PROFILES,
  WHATNOT_SUBCATEGORIES,
  WHATNOT_TYPES,
  buildWhatnotTitle,
  downloadWhatnotCsv,
  isWhatnotExportable,
  whatnotCondition,
} from '../../lib/whatnotExport';
import type {
  WhatnotCondition,
  WhatnotExportOptions,
  WhatnotShippingProfile,
  WhatnotSubcategory,
  WhatnotType,
} from '../../lib/whatnotExport';
import { cdnImg } from '../../lib/cdn';
import type { Card } from '../../types';

interface Props {
  cards: Card[];
  onClose: () => void;
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

/** Génère le CSV « Quick Add » Whatnot pour une sélection de cartes. Les cartes
 * sans prix ou sans photo sont listées mais exclues (Whatnot exige un prix et
 * des URL d'images publiques). */
export function WhatnotExportModal({ cards, onClose }: Props) {
  const [opts, setOpts] = useState<WhatnotExportOptions>(WHATNOT_DEFAULTS);
  const set = <K extends keyof WhatnotExportOptions>(key: K, value: WhatnotExportOptions[K]) =>
    setOpts((o) => ({ ...o, [key]: value }));

  const { exportable, skipped } = useMemo(() => ({
    exportable: cards.filter(isWhatnotExportable),
    skipped: cards.filter((c) => !isWhatnotExportable(c)),
  }), [cards]);

  function download() {
    downloadWhatnotCsv(exportable, opts);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-3xl glass border-strong shadow-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-black uppercase tracking-widest text-white">Export Whatnot</span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Fichier CSV à importer dans « Quick Add »
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select
            label="Sous-catégorie"
            value={opts.subcategory}
            options={WHATNOT_SUBCATEGORIES}
            onChange={(v: WhatnotSubcategory) => set('subcategory', v)}
          />
          <Select
            label="Type de vente"
            value={opts.type}
            options={WHATNOT_TYPES}
            onChange={(v: WhatnotType) => set('type', v)}
          />
          <Select
            label="Profil de livraison"
            value={opts.shippingProfile}
            options={WHATNOT_SHIPPING_PROFILES}
            onChange={(v: WhatnotShippingProfile) => set('shippingProfile', v)}
          />
          <Select
            label="État (cartes non gradées)"
            value={opts.rawCondition}
            options={WHATNOT_CONDITIONS.filter((c) => c !== 'Graded')}
            onChange={(v: WhatnotCondition) => set('rawCondition', v)}
          />
        </div>

        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Les cartes gradées passent automatiquement en « Graded ». Titre, description, quantité, prix et photos sont repris de chaque carte.
        </p>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <input
              type="checkbox"
              checked={opts.acceptOffers}
              onChange={(e) => set('acceptOffers', e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm font-medium text-white">Accepter les offres</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <input
              type="checkbox"
              checked={opts.includeCost}
              onChange={(e) => set('includeCost', e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm font-medium text-white">Inclure le prix d'achat (coût par article)</span>
          </label>
        </div>

        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {exportable.map((card) => (
            <div key={card.id} className="flex items-center gap-3 py-2 px-2.5">
              {card.image_front_url ? (
                <img src={cdnImg(card.image_front_url)} alt="" className="w-8 h-11 object-cover rounded-lg shrink-0" />
              ) : (
                <div className="w-8 h-11 rounded-lg shrink-0" style={{ background: 'var(--bg-elevated)' }} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{buildWhatnotTitle(card)}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {whatnotCondition(card, opts.rawCondition)}
                  {(card.quantity ?? 1) > 1 ? ` · ×${card.quantity}` : ''}
                </p>
              </div>
              <span className="text-sm font-black shrink-0" style={{ color: 'var(--accent)' }}>{card.price} €</span>
            </div>
          ))}
          {skipped.map((card) => (
            <div key={card.id} className="flex items-center gap-3 py-2 px-2.5 opacity-55">
              <div className="w-8 h-11 rounded-lg shrink-0 flex items-center justify-center text-xs" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{card.player ?? '—'}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--red)' }}>
                  {!card.image_front_url ? 'Photo recto manquante' : 'Prix manquant'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {skipped.length > 0 && (
          <p className="flex items-start gap-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
            {skipped.length} carte{skipped.length > 1 ? 's' : ''} exclue{skipped.length > 1 ? 's' : ''} : Whatnot exige un prix et au moins une photo.
          </p>
        )}

        <button
          onClick={download}
          disabled={exportable.length === 0}
          className="py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--accent)', color: '#09090B' }}
        >
          <Download size={16} />
          Télécharger le CSV ({exportable.length})
        </button>
      </div>
    </div>
  );
}
