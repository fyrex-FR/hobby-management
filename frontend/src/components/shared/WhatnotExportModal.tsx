import { useMemo, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, ImageOff } from 'lucide-react';
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
import { Field, Modal, Notice } from '../ui';

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
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="ui-select">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </Field>
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
    <Modal
      onClose={onClose}
      icon={<FileSpreadsheet size={18} className="text-[var(--text-muted)]" />}
      title="Export Whatnot"
      subtitle="Fichier CSV à importer dans « Quick Add »"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="ui-btn ui-btn-ghost">Annuler</button>
          <button onClick={download} disabled={exportable.length === 0} className="ui-btn ui-btn-primary">
            <Download size={15} />
            Télécharger le CSV ({exportable.length})
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        <p className="-mt-2 text-xs text-[var(--text-muted)]">
          Les cartes gradées passent automatiquement en « Graded ». Titre, description, quantité, prix et photos sont repris de chaque carte.
        </p>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={opts.acceptOffers}
              onChange={(e) => set('acceptOffers', e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-[13px] font-medium text-[var(--text-primary)]">Accepter les offres</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={opts.includeCost}
              onChange={(e) => set('includeCost', e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-[13px] font-medium text-[var(--text-primary)]">Inclure le prix d'achat (coût par article)</span>
          </label>
        </div>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            Cartes exportées <span className="tabular text-xs font-normal text-[var(--text-muted)]">{exportable.length}</span>
          </h3>
          <div className="max-h-56 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
            {exportable.map((card) => (
              <div key={card.id} className="flex items-center gap-3 px-3 py-2">
                {card.image_front_url ? (
                  <img src={cdnImg(card.image_front_url)} alt="" className="h-11 w-8 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="h-11 w-8 shrink-0 rounded-md bg-[var(--bg-elevated)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{buildWhatnotTitle(card)}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {whatnotCondition(card, opts.rawCondition)}
                    {(card.quantity ?? 1) > 1 ? ` · ×${card.quantity}` : ''}
                  </p>
                </div>
                <span className="tabular shrink-0 text-[13px] font-semibold text-[var(--price)]">{card.price != null ? euro.format(card.price) : '—'}</span>
              </div>
            ))}
            {skipped.map((card) => (
              <div key={card.id} className="flex items-center gap-3 px-3 py-2 opacity-60">
                <div className="flex h-11 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                  <ImageOff size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{card.player ?? '—'}</p>
                  <p className="truncate text-xs text-[var(--red)]">
                    {!card.image_front_url ? 'Photo recto manquante' : 'Prix manquant'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {skipped.length > 0 && (
          <Notice tone="warning" icon={AlertCircle}>
            {skipped.length} carte{skipped.length > 1 ? 's' : ''} exclue{skipped.length > 1 ? 's' : ''} : Whatnot exige un prix et au moins une photo.
          </Notice>
        )}
      </div>
    </Modal>
  );
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
