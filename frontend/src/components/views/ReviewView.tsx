import { useState } from 'react';
import { useCards, useUpdateCard, useDeleteCard } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card, CardType } from '../../types';

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
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
      >✕</button>
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

const inputCls = 'w-full rounded-lg px-2.5 py-1.5 text-sm outline-none transition-all placeholder:text-[var(--text-muted)]';
const inputStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function DraftRow({
  card,
  index,
  onValidate,
  onDiscard,
}: {
  card: Card;
  index: number;
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
    condition_notes: card.condition_notes ?? '',
    price: card.price?.toString() ?? '',
    purchase_price: card.purchase_price?.toString() ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleValidate() {
    setSaving(true);
    await onValidate(card.id, {
      ...fields,
      card_type: (fields.card_type || null) as CardType | null,
      price: fields.price ? parseFloat(fields.price) : null,
      purchase_price: fields.purchase_price ? parseFloat(fields.purchase_price) : null,
      status: 'collection',
    });
    setSaving(false);
  }

  async function handleDiscard() {
    setDiscarding(true);
    await onDiscard(card.id);
    setDiscarding(false);
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      {/* Row header — always visible */}
      <div className="flex items-center gap-4 p-4">
        {/* Index */}
        <span className="text-sm font-bold w-6 shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>
          {index + 1}
        </span>

        {/* Images */}
        <div className="flex gap-2 shrink-0">
          {card.image_front_url ? (
            <img
              src={card.image_front_url} alt="Face"
              className="h-16 w-auto rounded-lg object-contain cursor-zoom-in hover:opacity-80 transition-opacity"
              onClick={(e) => { e.stopPropagation(); setLightbox(card.image_front_url!); }}
            />
          ) : (
            <div className="h-16 w-12 rounded-lg flex items-center justify-center text-lg" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
          )}
          {card.image_back_url && (
            <img
              src={card.image_back_url} alt="Dos"
              className="h-16 w-auto rounded-lg object-contain opacity-50 cursor-zoom-in hover:opacity-70 transition-opacity"
              onClick={(e) => { e.stopPropagation(); setLightbox(card.image_back_url!); }}
            />
          )}
        </div>

        {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}

        {/* Summary */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {fields.player || <span style={{ color: 'var(--text-muted)' }}>Joueur inconnu</span>}
          </p>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {[fields.year, fields.brand, fields.set_name, fields.parallel_name !== 'Base' ? fields.parallel_name : null]
              .filter(Boolean).join(' · ')}
          </p>
          {fields.numbered && (
            <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-1"
              style={{ background: 'rgba(245,175,35,0.12)', color: 'var(--accent)', border: '1px solid rgba(245,175,35,0.2)' }}>
              {fields.numbered}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: expanded ? 'var(--bg-elevated)' : 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {expanded ? '▲ Réduire' : '✏ Modifier'}
          </button>
          <button
            onClick={handleValidate}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'var(--accent)', color: '#0E0E11', opacity: saving ? 0.5 : 1 }}
          >
            {saving ? '…' : '✓ Valider'}
          </button>
          <button
            onClick={handleDiscard}
            disabled={discarding}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors"
            style={{ border: '1px solid rgba(240,77,77,0.25)', color: 'var(--red)', opacity: discarding ? 0.5 : 1 }}
          >
            🗑
          </button>
        </div>
      </div>

      {/* Expanded edit fields */}
      {expanded && (
        <div className="px-4 pb-4 pt-0" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 pt-4">
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
            <Field label="Type">
              <select className={inputCls} style={inputStyle} value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
                <option value="">—</option>
                {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <div className="col-span-2">
              <Field label="Notes état">
                <input className={inputCls} style={inputStyle} value={fields.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewView() {
  const { data: cards = [], isLoading } = useCards();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const [validatingAll, setValidatingAll] = useState(false);

  const drafts = cards.filter((c) => c.status === 'draft');

  async function handleValidate(id: string, fields: Partial<Card>) {
    await updateCard.mutateAsync({ id, ...fields, status: 'collection' });
  }

  async function handleDiscard(id: string) {
    await deleteCard.mutateAsync(id);
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

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveView('batch')}
              className="text-sm transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              ← Import
            </button>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              Vérification des brouillons
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
            >
              {drafts.length}
            </span>
          </div>

          {drafts.length > 0 && (
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
          )}
        </div>

        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <span className="text-4xl">✓</span>
            <p style={{ color: 'var(--text-secondary)' }} className="text-sm">Aucun brouillon en attente.</p>
            <button
              onClick={() => setActiveView('collection')}
              className="text-sm"
              style={{ color: 'var(--accent)' }}
            >
              Voir la collection →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((card, i) => (
              <DraftRow
                key={card.id}
                card={card}
                index={i}
                onValidate={handleValidate}
                onDiscard={handleDiscard}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
