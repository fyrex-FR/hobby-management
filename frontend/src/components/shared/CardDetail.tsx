import { useState, useRef } from 'react';
import type { Card, CardType, GradingCompany, GradingStatus } from '../../types';
import { CardBadge } from './CardBadge';
import { GradingBadge } from './GradingBadge';
import { StatusBadge } from './StatusBadge';
import { useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useIdentify } from '../../hooks/useIdentify';
import { EbaySoldItems } from './EbaySoldItems';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/storage';
import { RookieBadge } from './RookieBadge';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const GRADING_COMPANIES: GradingCompany[] = ['PSA', 'BGS', 'SGC', 'CGC', 'HGA'];
const GRADING_STATUS_LABELS: Record<GradingStatus, string> = {
  submitted: 'Envoyée',
  received: 'Reçue par le grader',
  graded: 'Notée',
  returned: 'Retournée',
};

function GradingPanel({ card, onSave }: { card: Card; onSave: (data: Partial<Card>) => Promise<void> }) {
  const [form, setForm] = useState({
    grading_company: card.grading_company ?? '',
    grading_status: card.grading_status ?? 'submitted',
    grading_submitted_at: card.grading_submitted_at?.slice(0, 10) ?? '',
    grading_returned_at: card.grading_returned_at?.slice(0, 10) ?? '',
    grading_grade: card.grading_grade ?? '',
    grading_cert: card.grading_cert ?? '',
    grading_cost: card.grading_cost?.toString() ?? '',
  });
  const [saving, setSaving] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      grading_company: (form.grading_company || null) as GradingCompany | null,
      grading_status: (form.grading_status || null) as GradingStatus | null,
      grading_submitted_at: form.grading_submitted_at || null,
      grading_returned_at: form.grading_returned_at || null,
      grading_grade: form.grading_grade || null,
      grading_cert: form.grading_cert || null,
      grading_cost: form.grading_cost ? parseFloat(form.grading_cost) : null,
    });
    setSaving(false);
  }

  const inputCls = 'w-full rounded-lg px-2.5 py-1.5 text-sm outline-none transition-all';
  const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="rounded-2xl overflow-hidden mt-4" style={{ border: '1px solid var(--border)' }}>
      <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
        Grading
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Société</label>
          <select className={inputCls} style={inputStyle} value={form.grading_company} onChange={(e) => set('grading_company', e.target.value)}>
            <option value="">—</option>
            {GRADING_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Statut</label>
          <select className={inputCls} style={inputStyle} value={form.grading_status} onChange={(e) => set('grading_status', e.target.value)}>
            {(Object.entries(GRADING_STATUS_LABELS) as [GradingStatus, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Date d'envoi</label>
          <input type="date" className={inputCls} style={inputStyle} value={form.grading_submitted_at} onChange={(e) => set('grading_submitted_at', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Date de retour</label>
          <input type="date" className={inputCls} style={inputStyle} value={form.grading_returned_at} onChange={(e) => set('grading_returned_at', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Note</label>
          <input className={inputCls} style={inputStyle} placeholder="ex: 9.5" value={form.grading_grade} onChange={(e) => set('grading_grade', e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>N° certificat</label>
          <input className={inputCls} style={inputStyle} placeholder="ex: 12345678" value={form.grading_cert} onChange={(e) => set('grading_cert', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Coût du grading (€)</label>
          <input type="number" className={inputCls} style={inputStyle} placeholder="0" value={form.grading_cost} onChange={(e) => set('grading_cost', e.target.value)} />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="col-span-2 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: saving ? 'var(--text-muted)' : 'var(--text-primary)', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer le grading'}
        </button>
      </div>
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
  const [dragOver, setDragOver] = useState<'front' | 'back' | null>(null);
  const [uploadingImage, setUploadingImage] = useState<'front' | 'back' | null>(null);
  const [showGrading, setShowGrading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
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
    status: card.status,
    purchase_price: card.purchase_price?.toString() ?? '',
    price: card.price?.toString() ?? '',
    vinted_url: card.vinted_url ?? '',
    grading_company: card.grading_company ?? '',
    grading_status: card.grading_status ?? 'submitted',
    grading_grade: card.grading_grade ?? '',
    grading_cert: card.grading_cert ?? '',
    grading_submitted_at: card.grading_submitted_at?.slice(0, 10) ?? '',
    grading_returned_at: card.grading_returned_at?.slice(0, 10) ?? '',
    grading_cost: card.grading_cost?.toString() ?? '',
  });

  function set(key: keyof typeof fields, value: string | boolean) {
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
      vinted_url: fields.vinted_url || null,
      is_rookie: fields.is_rookie,
      grading_company: (fields.grading_company || null) as GradingCompany | null,
      grading_status: (fields.grading_status || null) as GradingStatus | null,
      grading_grade: fields.grading_grade || null,
      grading_cert: fields.grading_cert || null,
      grading_submitted_at: fields.grading_submitted_at || null,
      grading_returned_at: fields.grading_returned_at || null,
      grading_cost: fields.grading_cost ? parseFloat(fields.grading_cost) : null,
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
        is_rookie: r.is_rookie ?? prev.is_rookie,
        condition_notes: r.condition_notes || prev.condition_notes,
      }));
    } catch (e) {
      setReanalyzeError((e as Error).message);
    }
  }

  async function handleImageUpload(file: File, side: 'front' | 'back') {
    if (!file.type.startsWith('image/')) return;
    setUploadingImage(side);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const blob = await compressImage(file);
      const form = new FormData();
      form.append('file', new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
      form.append('card_id', card.id);
      form.append('side', side);
      const r = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!r.ok) throw new Error(await r.text());
      const { url } = await r.json();
      await updateCard.mutateAsync({
        id: card.id,
        [side === 'front' ? 'image_front_url' : 'image_back_url']: url,
      });
    } finally {
      setUploadingImage(null);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer ${card.player ?? 'cette carte'} ?`)) return;
    await deleteCard.mutateAsync(card.id);
    onClose();
  }

  function handleImageClick(side: 'front' | 'back') {
    const url = side === 'front' ? card.image_front_url : card.image_back_url;
    if (!url) return;
    if (editing) {
      if (side === 'front') frontInputRef.current?.click();
      else backInputRef.current?.click();
      return;
    }
    setLightboxUrl(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl sm:rounded-3xl w-full sm:max-w-3xl overflow-hidden max-h-[90vh] flex flex-col min-h-0"
        style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header images */}
        <div className="flex gap-3 p-5 border-b shrink-0" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          {/* Front image — drag & drop zone */}
          <div
            className="relative shrink-0 rounded-xl overflow-hidden cursor-pointer transition-all"
            style={{
              outline: dragOver === 'front' ? '2px solid var(--accent)' : '2px solid transparent',
              background: dragOver === 'front' ? 'rgba(245,166,35,0.1)' : 'transparent',
            }}
            onDragOver={(e) => { if (!editing) return; e.preventDefault(); setDragOver('front'); }}
            onDragLeave={() => { if (editing) setDragOver(null); }}
            onDrop={(e) => { if (!editing) return; e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f, 'front'); }}
            onClick={() => handleImageClick('front')}
            title={editing ? 'Cliquer ou déposer une image pour remplacer' : 'Cliquer pour agrandir'}
          >
            {card.image_front_url ? (
              <img
                src={card.image_front_url}
                alt="Face"
                className={`h-32 w-auto rounded-xl object-contain ${editing ? '' : 'cursor-zoom-in hover:opacity-85'}`}
              />
            ) : (
              <div className="h-32 w-20 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
            )}
            {editing && (uploadingImage === 'front' || dragOver === 'front') && (
              <div className="absolute inset-0 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.5)' }}>
                <span className="text-white text-xs font-medium">
                  {uploadingImage === 'front' ? '⟳' : '📥'}
                </span>
              </div>
            )}
            <input ref={frontInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'front'); e.target.value = ''; }} />
          </div>

          {/* Back image — drag & drop zone */}
          <div
            className="relative shrink-0 rounded-xl overflow-hidden cursor-pointer transition-all"
            style={{
              outline: dragOver === 'back' ? '2px solid var(--accent)' : '2px solid transparent',
              background: dragOver === 'back' ? 'rgba(245,166,35,0.1)' : 'transparent',
            }}
            onDragOver={(e) => { if (!editing) return; e.preventDefault(); setDragOver('back'); }}
            onDragLeave={() => { if (editing) setDragOver(null); }}
            onDrop={(e) => { if (!editing) return; e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f, 'back'); }}
            onClick={() => handleImageClick('back')}
            title={editing ? 'Cliquer ou déposer une image pour remplacer' : 'Cliquer pour agrandir'}
          >
            {card.image_back_url ? (
              <img
                src={card.image_back_url}
                alt="Dos"
                className={`h-32 w-auto rounded-xl object-contain opacity-60 ${editing ? '' : 'cursor-zoom-in hover:opacity-75'}`}
              />
            ) : (
              <div className="h-32 w-20 rounded-xl flex items-center justify-center text-2xl opacity-40" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
            )}
            {editing && (uploadingImage === 'back' || dragOver === 'back') && (
              <div className="absolute inset-0 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.5)' }}>
                <span className="text-white text-xs font-medium">
                  {uploadingImage === 'back' ? '⟳' : '📥'}
                </span>
              </div>
            )}
            <input ref={backInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'back'); e.target.value = ''; }} />
          </div>
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
              {card.is_rookie && <RookieBadge compact />}
              {card.grading_company && <GradingBadge card={card} />}
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
        <div className="overflow-y-auto flex-1 min-h-0 p-5">
          {!editing ? (
            /* View mode */
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-5">
              {[
                ['Année', card.year],
                ['Marque', card.brand],
                ['Set', card.set_name],
                ['Insert', card.insert_name],
                ['Parallel', card.parallel_name],
                ['RC', card.is_rookie ? 'Oui' : null],
                ['Grading', card.grading_company ? `${card.grading_company}${card.grading_status ? ` - ${GRADING_STATUS_LABELS[card.grading_status]}` : ''}${card.grading_grade ? ` - ${card.grading_grade}` : ''}` : null],
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
            <div className="mb-5">
              <div
                className="rounded-2xl p-3 mb-3"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Grading
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      PSA visible ici, sans scroll.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowGrading((v) => !v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  >
                    {showGrading ? 'Masquer détails' : 'Plus d’options'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Société</label>
                    <select className={inputClass} style={inputStyle} value={fields.grading_company} onChange={(e) => set('grading_company', e.target.value)}>
                      <option value="">—</option>
                      {GRADING_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Statut</label>
                    <select className={inputClass} style={inputStyle} value={fields.grading_status} onChange={(e) => set('grading_status', e.target.value)}>
                      {(Object.entries(GRADING_STATUS_LABELS) as [GradingStatus, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Note</label>
                    <input className={inputClass} style={inputStyle} value={fields.grading_grade} onChange={(e) => set('grading_grade', e.target.value)} placeholder="ex: 10" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Rookie Card</label>
                  <button
                    type="button"
                    onClick={() => set('is_rookie', !fields.is_rookie)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold transition-all"
                    style={fields.is_rookie
                      ? { background: 'rgba(37,99,235,0.16)', color: '#dbeafe', border: '1px solid rgba(96,165,250,0.45)' }
                      : { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  >
                    {fields.is_rookie ? <RookieBadge compact /> : 'Non RC'}
                  </button>
                </div>

                {showGrading && (
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>N° certificat</label>
                      <input className={inputClass} style={inputStyle} value={fields.grading_cert} onChange={(e) => set('grading_cert', e.target.value)} placeholder="ex: 12345678" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Coût grading (€)</label>
                      <input type="number" className={inputClass} style={inputStyle} value={fields.grading_cost} onChange={(e) => set('grading_cost', e.target.value)} placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Date d'envoi</label>
                      <input type="date" className={inputClass} style={inputStyle} value={fields.grading_submitted_at} onChange={(e) => set('grading_submitted_at', e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Date de retour</label>
                      <input type="date" className={inputClass} style={inputStyle} value={fields.grading_returned_at} onChange={(e) => set('grading_returned_at', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                ['vinted_url', 'Lien Vinted'],
              ] as [
                'player' | 'team' | 'year' | 'brand' | 'set_name' | 'insert_name' | 'parallel_name' | 'card_number' | 'numbered' | 'purchase_price' | 'price' | 'vinted_url',
                string
              ][]).map(([key, label]) => (
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
            </div>
          )}

          {/* Actions */}
          {!editing && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(buildPriceSearchText(card));
                  window.open(`https://130point.com/sales/?q=${encodeURIComponent(buildPriceSearchText(card))}`, '_blank');
                }}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                <img src="/130point.svg" alt="" className="h-4 w-auto" />
                Ventes terminées ↗
              </button>

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

              {/* Grading toggle */}
              <button
                onClick={() => setShowGrading((v) => !v)}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                style={showGrading
                  ? { background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }
                  : { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                }
              >
                🏅 {card.grading_status ? `Grading — ${GRADING_STATUS_LABELS[card.grading_status]}${card.grading_grade ? ` · ${card.grading_grade}` : ''}` : 'Grading'}
                <span style={{ opacity: 0.5 }}>{showGrading ? '▲' : '▼'}</span>
              </button>

              {showGrading && (
                <GradingPanel
                  card={card}
                  onSave={async (data) => {
                    await updateCard.mutateAsync({ id: card.id, ...data });
                  }}
                />
              )}

              <div className="flex gap-2">
                {card.vinted_url ? (
                  <a
                    href={card.vinted_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-center transition-all"
                    style={{ background: 'var(--accent)', color: '#0d0c0b', boxShadow: '0 0 20px var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    Voir sur Vinted ↗
                  </a>
                ) : (
                  <button
                    onClick={publishToVinted}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: 'var(--accent)', color: '#0d0c0b', boxShadow: '0 0 20px var(--accent-glow)' }}
                  >
                    Publier sur Vinted
                  </button>
                )}
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

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
            style={{ boxShadow: '0 0 80px rgba(0,0,0,0.9)' }}
          />
          <button
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-sm"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
            onClick={() => setLightboxUrl(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
