import { useState } from 'react';
import type { Card, CardType } from '../../types';
import { CardBadge } from './CardBadge';
import { StatusBadge } from './StatusBadge';
import { useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useIdentify } from '../../hooks/useIdentify';
import { EbaySoldItems } from './EbaySoldItems';

const CARD_TYPES: { value: CardType; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'insert', label: 'Insert' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'numbered', label: 'Numbered' },
  { value: 'auto', label: 'Auto' },
  { value: 'patch', label: 'Patch' },
  { value: 'auto_patch', label: 'Auto/Patch' },
];

const inputClass =
  'w-full rounded-lg px-2 py-1.5 text-sm outline-none transition-all placeholder:text-[var(--text-muted)]';
const inputStyle = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
};

function buildPriceSearchText(card: Card): string {
  return [card.player, card.team, card.year, card.set_name || card.brand, card.insert_name, card.parallel_name, card.numbered]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Props {
  card: Card;
  onClose: () => void;
}

export function CardDetail({ card, onClose }: Props) {
  const deleteCard = useDeleteCard();
  const updateCard = useUpdateCard();

  const identify = useIdentify();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState('');
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
    status: card.status,
    purchase_price: card.purchase_price?.toString() ?? '',
    price: card.price?.toString() ?? '',
  });

  function set(key: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    await updateCard.mutateAsync({
      id: card.id,
      ...fields,
      card_type: (fields.card_type || null) as CardType | null,
      purchase_price: fields.purchase_price ? parseFloat(fields.purchase_price) : null,
      price: fields.price ? parseFloat(fields.price) : null,
    });
    setSaving(false);
    setEditing(false);
  }


  function openEbaySold() {
    const text = buildPriceSearchText(card);
    const query = encodeURIComponent(text).replace(/%20/g, '+');
    window.open(`https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1`, '_blank');
  }

  async function publishToVinted() {
    const parts = [
      card.player, card.year, card.brand, card.set_name, card.insert_name,
      card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : null,
      card.numbered ?? null,
    ].filter(Boolean);

    // Convertir les images en base64 pour les passer à l'extension
    async function toBase64(url: string): Promise<string | null> {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    }

    const photoUrls = [card.image_front_url, card.image_back_url].filter(Boolean) as string[];
    const photos = (await Promise.all(photoUrls.map(toBase64))).filter(Boolean) as string[];

    const payload = {
      title: parts.join(' '),
      description: [
        card.brand && card.set_name ? `${card.brand} ${card.set_name}` : null,
        card.insert_name ? `Insert : ${card.insert_name}` : null,
        card.parallel_name ? `Parallel : ${card.parallel_name}` : null,
        card.card_number ? `Carte ${card.card_number}` : null,
        card.numbered ? `Numérotée ${card.numbered}` : null,
        card.condition_notes ? `État : ${card.condition_notes}` : 'Excellent état, jamais joué',
      ].filter(Boolean).join('\n'),
      price: card.price ?? 0,
      brand: card.brand ?? '',
      photos,
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    window.open(`https://www.vinted.fr/items/new#vinted_pending=${encoded}`, '_blank');
  }

  async function handleReanalyze() {
    if (!card.image_front_url || !card.image_back_url) return;
    setReanalyzeError('');
    try {
      async function urlToFile(url: string, name: string): Promise<File> {
        const resp = await fetch(url);
        const blob = await resp.blob();
        return new File([blob], name, { type: blob.type || 'image/jpeg' });
      }
      const [frontFile, backFile] = await Promise.all([
        urlToFile(card.image_front_url, 'front.jpg'),
        urlToFile(card.image_back_url, 'back.jpg'),
      ]);
      const r = await identify.mutateAsync({ frontFile, backFile });
      setFields((prev) => ({
        ...prev,
        player: r.player || prev.player,
        team: r.team || prev.team,
        year: r.year || prev.year,
        brand: r.brand || prev.brand,
        set_name: r.set || prev.set_name,
        card_type: r.card_type || prev.card_type,
        insert_name: r.insert || prev.insert_name,
        parallel_name: r.parallel || prev.parallel_name,
        card_number: r.card_number || prev.card_number,
        numbered: r.numbered || prev.numbered,
        condition_notes: r.condition_notes || prev.condition_notes,
      }));
    } catch (e) {
      setReanalyzeError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer ${card.player ?? 'cette carte'} ?`)) return;
    await deleteCard.mutateAsync(card.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl sm:rounded-3xl w-full sm:max-w-3xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header images */}
        <div className="flex gap-3 p-5 border-b shrink-0" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          {card.image_front_url ? (
            <img src={card.image_front_url} alt="Face" className="h-32 w-auto rounded-xl object-contain" />
          ) : (
            <div className="h-32 w-20 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
          )}
          {card.image_back_url && (
            <img src={card.image_back_url} alt="Dos" className="h-32 w-auto rounded-xl object-contain opacity-60" />
          )}
          <div className="flex-1 flex flex-col justify-between min-w-0">
            <div>
              <h2 className="text-lg font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                {card.player ?? '—'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{card.team}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <CardBadge type={card.card_type} />
              <StatusBadge status={card.status} />
              {card.numbered && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(245,166,35,0.12)', color: 'var(--accent)', border: '1px solid rgba(245,166,35,0.2)' }}>
                  {card.numbered}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >✕</button>
            <button
              onClick={() => setEditing((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={editing
                ? { background: 'var(--accent)', color: '#0E0E11' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }
              }
            >
              {editing ? '✕ Annuler' : '✏ Modifier'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">
          {!editing ? (
            /* View mode */
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-5">
              {[
                ['Année', card.year],
                ['Marque', card.brand],
                ['Set', card.set_name],
                ['Insert', card.insert_name],
                ['Parallel', card.parallel_name],
                ['N° carte', card.card_number],
                ['État', card.condition_notes || 'Mint'],
                ['Prix achat', card.purchase_price != null ? `${card.purchase_price} €` : null],
                ['Prix vente', card.price != null ? `${card.price} €` : null],
              ]
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</dt>
                    <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>{value}</dd>
                  </div>
                ))}
            </div>
          ) : (
            /* Edit mode */
            <div className="grid grid-cols-2 gap-3 mb-5">
              {([
                ['player', 'Joueur'],
                ['team', 'Équipe'],
                ['year', 'Année'],
                ['brand', 'Marque'],
                ['set_name', 'Set'],
                ['insert_name', 'Insert'],
                ['parallel_name', 'Parallel'],
                ['card_number', 'N° carte'],
                ['numbered', 'Tirage'],
                ['purchase_price', 'Prix achat (€)'],
                ['price', 'Prix vente (€)'],
              ] as [keyof typeof fields, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
                  <input className={inputClass} style={inputStyle} value={fields[key]} onChange={(e) => set(key, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Type</label>
                <select className={inputClass} style={inputStyle} value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
                  <option value="">—</option>
                  {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Statut</label>
                <select className={inputClass} style={inputStyle} value={fields.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="collection">Collection</option>
                  <option value="a_vendre">À vendre</option>
                  <option value="reserve">Réservé</option>
                  <option value="vendu">Vendu</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Notes d'état</label>
                <input className={inputClass} style={inputStyle} value={fields.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} />
              </div>

              <div className="col-span-2 pt-1 flex flex-col gap-2">
                {card.image_front_url && card.image_back_url && (
                  <button
                    onClick={handleReanalyze}
                    disabled={identify.isPending}
                    className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    style={{
                      background: identify.isSuccess ? 'rgba(16,185,129,0.1)' : 'var(--bg-elevated)',
                      border: `1px solid ${identify.isSuccess ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                      color: identify.isSuccess ? 'rgb(16,185,129)' : 'var(--text-secondary)',
                      opacity: identify.isPending ? 0.6 : 1,
                    }}
                  >
                    {identify.isPending ? <><span className="animate-spin inline-block">⟳</span> Analyse en cours…</> : identify.isSuccess ? '✓ IA appliquée — relancer ?' : '🔍 Ré-analyser avec l\'IA'}
                  </button>
                )}
                {reanalyzeError && (
                  <p className="text-xs px-1" style={{ color: 'var(--red)' }}>{reanalyzeError}</p>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'var(--accent)', color: '#0E0E11', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!editing && (
            <div className="flex flex-col gap-2">
              <a
                href={`https://130point.com/sales/?q=${encodeURIComponent(buildPriceSearchText(card))}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                <img src="/130point.svg" alt="" className="h-4 w-auto" />
                Ventes terminées ↗
              </a>

              <button
                onClick={openEbaySold}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                <svg viewBox="0 0 100 40" width="40" height="16" aria-label="eBay">
                  <text x="0" y="32" fontSize="40" fontWeight="bold" fontFamily="Arial, sans-serif">
                    <tspan fill="#E53238">e</tspan>
                    <tspan fill="#0064D2">B</tspan>
                    <tspan fill="#F5AF02">a</tspan>
                    <tspan fill="#86B817">y</tspan>
                  </text>
                </svg>
                Ventes terminées ↗
              </button>

              <EbaySoldItems query={buildPriceSearchText(card)} />


              <div className="flex gap-2">
                <button
                  onClick={publishToVinted}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--accent)', color: '#0d0c0b', boxShadow: '0 0 20px var(--accent-glow)' }}
                >
                  Publier sur Vinted
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteCard.isPending}
                  className="px-4 py-2.5 rounded-xl text-sm transition-colors"
                  style={{ border: '1px solid rgba(232,64,64,0.3)', color: 'var(--red)' }}
                >
                  🗑
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
