import { useEffect, useMemo, useState } from 'react';
import { useCards, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card, CardStatus, CardType } from '../../types';
import { RookieBadge } from '../shared/RookieBadge';

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
        style={{ boxShadow: '0 0 60px rgba(0,0,0,0.8)' }}
      />
      <button
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-sm"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}

const CARD_TYPES: { value: CardType; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'insert', label: 'Insert' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'numbered', label: 'Numbered' },
  { value: 'auto', label: 'Auto' },
  { value: 'patch', label: 'Patch' },
  { value: 'auto_patch', label: 'Auto/Patch' },
];

const STATUS_OPTIONS: { value: CardStatus; label: string }[] = [
  { value: 'collection', label: 'Collection' },
  { value: 'a_vendre', label: 'À vendre' },
  { value: 'reserve', label: 'Réservé' },
  { value: 'vendu', label: 'Vendu' },
];

const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all placeholder:text-[var(--text-muted)]';
const inputStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold tracking-wider uppercase mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function DraftEditor({
  card,
  index,
  total,
  onNavigate,
  onValidate,
  onDiscard,
}: {
  card: Card;
  index: number;
  total: number;
  onNavigate: (nextIndex: number) => void;
  onValidate: (id: string, fields: Partial<Card>) => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
}) {
  const [fields, setFields] = useState({
    player: card.player ?? '',
    team: card.team ?? '',
    year: card.year ?? '',
    brand: card.brand ?? '',
    set_name: card.set_name ?? '',
    card_type: card.card_type ?? '',
    insert_name: card.insert_name ?? '',
    parallel_name: card.parallel_name ?? '',
    card_number: card.card_number ?? '',
    numbered: card.numbered ?? '',
    is_rookie: card.is_rookie ?? false,
    condition_notes: card.condition_notes ?? '',
    price: card.price?.toString() ?? '',
    purchase_price: card.purchase_price?.toString() ?? '',
    status: (card.status === 'draft' ? 'collection' : card.status) as Exclude<CardStatus, 'draft'>,
  });
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    setFields({
      player: card.player ?? '',
      team: card.team ?? '',
      year: card.year ?? '',
      brand: card.brand ?? '',
      set_name: card.set_name ?? '',
      card_type: card.card_type ?? '',
      insert_name: card.insert_name ?? '',
      parallel_name: card.parallel_name ?? '',
      card_number: card.card_number ?? '',
      numbered: card.numbered ?? '',
      is_rookie: card.is_rookie ?? false,
      condition_notes: card.condition_notes ?? '',
      price: card.price?.toString() ?? '',
      purchase_price: card.purchase_price?.toString() ?? '',
      status: (card.status === 'draft' ? 'collection' : card.status) as Exclude<CardStatus, 'draft'>,
    });
  }, [card]);

  function set(key: keyof typeof fields, value: string | boolean) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleValidateAndNext() {
    setSaving(true);
    await onValidate(card.id, {
      ...fields,
      card_type: (fields.card_type || null) as CardType | null,
      price: fields.price ? parseFloat(fields.price) : null,
      purchase_price: fields.purchase_price ? parseFloat(fields.purchase_price) : null,
      is_rookie: fields.is_rookie,
      status: fields.status,
    });
    setSaving(false);
    if (index < total - 1) onNavigate(index + 1);
  }

  async function handleDiscardAndNext() {
    setDiscarding(true);
    await onDiscard(card.id);
    setDiscarding(false);
  }

  return (
    <>
      <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-6">
        <div className="space-y-4">
          <div className="rounded-3xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="grid grid-cols-2 gap-3">
              {card.image_front_url ? (
                <button
                  type="button"
                  onClick={() => setLightbox(card.image_front_url!)}
                  className="rounded-2xl overflow-hidden transition-transform hover:scale-[1.01]"
                  style={{ background: 'var(--bg-card)' }}
                >
                  <img src={card.image_front_url} alt="Face" className="w-full aspect-[3/4] object-contain cursor-zoom-in" />
                </button>
              ) : (
                <div className="rounded-2xl flex items-center justify-center aspect-[3/4] text-4xl" style={{ background: 'var(--bg-card)' }}>🃏</div>
              )}
              {card.image_back_url ? (
                <button
                  type="button"
                  onClick={() => setLightbox(card.image_back_url!)}
                  className="rounded-2xl overflow-hidden transition-transform hover:scale-[1.01]"
                  style={{ background: 'var(--bg-card)' }}
                >
                  <img src={card.image_back_url} alt="Dos" className="w-full aspect-[3/4] object-contain cursor-zoom-in opacity-80" />
                </button>
              ) : (
                <div className="rounded-2xl flex items-center justify-center aspect-[3/4] text-4xl opacity-40" style={{ background: 'var(--bg-card)' }}>🃏</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Brouillon {index + 1} / {total}
              </span>
              <div className="flex items-center gap-2">
                {fields.is_rookie && <RookieBadge compact />}
                {fields.numbered && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: 'rgba(245,175,35,0.12)', color: 'var(--accent)', border: '1px solid rgba(245,175,35,0.2)' }}
                  >
                    {fields.numbered}
                  </span>
                )}
              </div>
            </div>
            <p className="text-lg font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{fields.player || 'Joueur inconnu'}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              {[fields.year, fields.brand, fields.set_name].filter(Boolean).join(' · ') || 'À compléter'}
            </p>
          </div>
        </div>

        <div className="rounded-3xl p-5" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Joueur">
              <input className={inputCls} style={inputStyle} value={fields.player} onChange={(e) => set('player', e.target.value)} />
            </Field>
            <Field label="Équipe">
              <input className={inputCls} style={inputStyle} value={fields.team} onChange={(e) => set('team', e.target.value)} />
            </Field>
            <Field label="Année">
              <input className={inputCls} style={inputStyle} value={fields.year} onChange={(e) => set('year', e.target.value)} />
            </Field>
            <Field label="Marque">
              <input className={inputCls} style={inputStyle} value={fields.brand} onChange={(e) => set('brand', e.target.value)} />
            </Field>
            <Field label="Set">
              <input className={inputCls} style={inputStyle} value={fields.set_name} onChange={(e) => set('set_name', e.target.value)} />
            </Field>
            <Field label="Insert">
              <input className={inputCls} style={inputStyle} value={fields.insert_name} onChange={(e) => set('insert_name', e.target.value)} />
            </Field>
            <Field label="Parallel">
              <input className={inputCls} style={inputStyle} value={fields.parallel_name} onChange={(e) => set('parallel_name', e.target.value)} />
            </Field>
            <Field label="Type">
              <select className={inputCls} style={inputStyle} value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
                <option value="">—</option>
                {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="N° carte">
              <input className={inputCls} style={inputStyle} value={fields.card_number} onChange={(e) => set('card_number', e.target.value)} />
            </Field>
            <Field label="Tirage">
              <input className={inputCls} style={inputStyle} value={fields.numbered} onChange={(e) => set('numbered', e.target.value)} />
            </Field>
            <Field label="Prix achat €">
              <input className={inputCls} style={inputStyle} value={fields.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Prix vente €">
              <input className={inputCls} style={inputStyle} value={fields.price} onChange={(e) => set('price', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Statut final">
              <select className={inputCls} style={inputStyle} value={fields.status} onChange={(e) => set('status', e.target.value as Exclude<CardStatus, 'draft'>)}>
                {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </Field>
            <Field label="RC">
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-all"
                style={fields.is_rookie
                  ? { background: 'rgba(37,99,235,0.16)', color: '#dbeafe', border: '1px solid rgba(96,165,250,0.45)' }
                  : inputStyle}
                onClick={() => set('is_rookie', !fields.is_rookie)}
              >
                {fields.is_rookie ? <RookieBadge compact /> : 'Non RC'}
              </button>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes état">
                <input className={inputCls} style={inputStyle} value={fields.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-6 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onNavigate(index - 1)}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'var(--bg-card)', color: index === 0 ? 'var(--text-muted)' : 'var(--text-primary)', border: '1px solid var(--border)', opacity: index === 0 ? 0.5 : 1 }}
              >
                ← Précédente
              </button>
              <button
                type="button"
                disabled={index >= total - 1}
                onClick={() => onNavigate(index + 1)}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'var(--bg-card)', color: index >= total - 1 ? 'var(--text-muted)' : 'var(--text-primary)', border: '1px solid var(--border)', opacity: index >= total - 1 ? 0.5 : 1 }}
              >
                Suivante →
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscardAndNext}
                disabled={discarding}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={{ border: '1px solid rgba(240,77,77,0.25)', color: 'var(--red)', opacity: discarding ? 0.5 : 1 }}
              >
                {discarding ? 'Suppression…' : 'Supprimer'}
              </button>
              <button
                type="button"
                onClick={handleValidateAndNext}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: 'var(--accent)', color: '#0E0E11', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Validation…' : index < total - 1 ? 'Valider et suivante' : 'Valider'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

export function ReviewView() {
  const { data: cards = [], isLoading } = useCards();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [validatingAll, setValidatingAll] = useState(false);

  const drafts = useMemo(() => cards.filter((c) => c.status === 'draft'), [cards]);

  useEffect(() => {
    if (currentIndex > Math.max(0, drafts.length - 1)) {
      setCurrentIndex(Math.max(0, drafts.length - 1));
    }
  }, [drafts.length, currentIndex]);

  async function handleValidate(id: string, fields: Partial<Card>) {
    await updateCard.mutateAsync({ id, ...fields, status: fields.status ?? 'collection' });
  }

  async function handleDiscard(id: string) {
    const currentCardIndex = drafts.findIndex((c) => c.id === id);
    await deleteCard.mutateAsync(id);
    const nextLength = Math.max(0, drafts.length - 1);
    setCurrentIndex((prev) => {
      if (currentCardIndex === -1) return Math.min(prev, Math.max(0, nextLength - 1));
      return Math.min(currentCardIndex, Math.max(0, nextLength - 1));
    });
  }

  async function handleValidateAll() {
    setValidatingAll(true);
    for (const card of drafts) {
      await updateCard.mutateAsync({ id: card.id, status: 'collection' });
    }
    setValidatingAll(false);
    setActiveView('collection');
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span style={{ color: 'var(--text-muted)' }} className="text-sm">Chargement…</span>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setActiveView('batch')} className="text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}>
              ← Import
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Vérification des brouillons</h2>
          </div>
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <span className="text-4xl">✓</span>
            <p style={{ color: 'var(--text-secondary)' }} className="text-sm">Aucun brouillon en attente.</p>
            <button onClick={() => setActiveView('collection')} className="text-sm" style={{ color: 'var(--accent)' }}>
              Voir la collection →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = drafts[currentIndex];

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveView('batch')} className="text-sm transition-colors" style={{ color: 'var(--text-secondary)' }}>
              ← Import
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Vérification des brouillons</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
              {drafts.length}
            </span>
          </div>

          <button
            onClick={handleValidateAll}
            disabled={validatingAll}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'var(--bg-elevated)',
              color: validatingAll ? 'var(--text-muted)' : 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
              opacity: validatingAll ? 0.6 : 1,
            }}
          >
            {validatingAll ? 'Validation…' : `Tout valider (${drafts.length})`}
          </button>
        </div>

        <DraftEditor
          key={current.id}
          card={current}
          index={currentIndex}
          total={drafts.length}
          onNavigate={setCurrentIndex}
          onValidate={handleValidate}
          onDiscard={handleDiscard}
        />
      </div>
    </div>
  );
}
