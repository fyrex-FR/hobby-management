import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Trash2,
  Edit2,
  Save,
  Camera,
  RefreshCw,
  ExternalLink,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  AlertCircle,
  Clock,
  Euro,
  Hash,
  Tag,
  Star,
  Layers,
  Trophy
} from 'lucide-react';
import type { Card, CardType, GradingCompany, GradingStatus } from '../../types';
import { GradingBadge } from './GradingBadge';
import { StatusBadge } from './StatusBadge';
import { useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useIdentify } from '../../hooks/useIdentify';
import { EbaySoldItems } from './EbaySoldItems';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/storage';
import { RookieBadge } from './RookieBadge';
import { normalizeParallelName } from '../../lib/cardQuality';


const inputCls = 'w-full rounded-xl px-3 py-2 text-sm outline-none transition-all bg-white/5 border border-white/10 focus:border-[var(--accent)]/50 focus:bg-white/10';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const GRADING_COMPANIES: GradingCompany[] = ['PSA', 'BGS', 'SGC', 'CGC', 'HGA'];
const GRADING_STATUS_LABELS: Record<GradingStatus, string> = {
  submitted: 'Envoyée',
  received: 'Reçue par le grader',
  graded: 'Notée',
  returned: 'Retournée',
};

const CARD_TYPES: { value: CardType; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'insert', label: 'Insert' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'numbered', label: 'Numbered' },
  { value: 'auto', label: 'Auto' },
  { value: 'patch', label: 'Patch' },
  { value: 'auto_patch', label: 'Auto/Patch' },
];

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
  const [lightboxSide, setLightboxSide] = useState<'front' | 'back' | null>(null);
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
    setLightboxSide(side);
  }

  return (
    <>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 20, opacity: 0 }}
          className="rounded-3xl w-full sm:max-w-3xl overflow-hidden max-h-[95vh] flex flex-col min-h-0 glass border border-white/10 shadow-2xl shadow-black/60"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header images */}
          <div className="flex flex-col sm:flex-row gap-6 p-6 border-b border-white/5 bg-white/5 relative">
            <div className="flex gap-4">
              {/* Front image — drag & drop zone */}
              <div
                className="relative shrink-0 rounded-2xl overflow-hidden group cursor-pointer transition-all aspect-[2.5/3.5] h-40"
                style={{
                  outline: dragOver === 'front' ? '2px solid var(--accent)' : '1px solid white/10',
                  background: dragOver === 'front' ? 'var(--accent-dim)' : 'var(--bg-card)',
                }}
                onDragOver={(e) => { if (!editing) return; e.preventDefault(); setDragOver('front'); }}
                onDragLeave={() => { if (editing) setDragOver(null); }}
                onDrop={(e) => { if (!editing) return; e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f, 'front'); }}
                onClick={() => handleImageClick('front')}
              >
                {card.image_front_url ? (
                  <img
                    src={card.image_front_url}
                    alt="Face"
                    className={`h-full w-full object-cover transition-transform duration-500 ${editing ? 'group-hover:scale-105 opacity-80' : 'group-hover:scale-110'}`}
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center gap-2 opacity-30 text-[var(--text-muted)]">
                    <ImageIcon size={32} strokeWidth={1} />
                    <span className="text-[10px] uppercase font-bold tracking-widest">Face</span>
                  </div>
                )}

                {editing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={20} className="text-white" />
                  </div>
                )}

                {uploadingImage === 'front' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <RefreshCw size={24} className="text-[var(--accent)] animate-spin" />
                  </div>
                )}
                <input ref={frontInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'front'); e.target.value = ''; }} />
              </div>

              {/* Back image — drag & drop zone */}
              <div
                className="relative shrink-0 rounded-2xl overflow-hidden group cursor-pointer transition-all aspect-[2.5/3.5] h-40"
                style={{
                  outline: dragOver === 'back' ? '2px solid var(--accent)' : '1px solid white/10',
                  background: dragOver === 'back' ? 'var(--accent-dim)' : 'var(--bg-card)',
                }}
                onDragOver={(e) => { if (!editing) return; e.preventDefault(); setDragOver('back'); }}
                onDragLeave={() => { if (editing) setDragOver(null); }}
                onDrop={(e) => { if (!editing) return; e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f, 'back'); }}
                onClick={() => handleImageClick('back')}
              >
                {card.image_back_url ? (
                  <img
                    src={card.image_back_url}
                    alt="Dos"
                    className={`h-full w-full object-cover transition-transform duration-500 ${editing ? 'group-hover:scale-105 opacity-50' : 'opacity-40 group-hover:scale-110 group-hover:opacity-60'}`}
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center gap-2 opacity-20 text-[var(--text-muted)]">
                    <ImageIcon size={32} strokeWidth={1} />
                    <span className="text-[10px] uppercase font-bold tracking-widest">Dos</span>
                  </div>
                )}

                {editing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={20} className="text-white" />
                  </div>
                )}

                {uploadingImage === 'back' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <RefreshCw size={24} className="text-[var(--accent)] animate-spin" />
                  </div>
                )}
                <input ref={backInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'back'); e.target.value = ''; }} />
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center min-w-0">
              <div className="mb-4">
                <h2 className="text-2xl font-black leading-tight tracking-tight text-white mb-1 truncate">
                  {card.player ?? 'Carte Inconnue'}
                </h2>
                <div className="flex items-center gap-2 text-[var(--text-secondary)] font-medium text-sm">
                  <span>{card.team}</span>
                  {card.year && (
                    <>
                      <div className="w-1 h-1 rounded-full bg-white/20" />
                      <span>{card.year}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusBadge status={card.status} />
                {card.is_rookie && <RookieBadge compact />}
                {card.grading_company && <GradingBadge card={card} />}

                {card.numbered && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-black border border-[var(--border-accent)]">
                    <Hash size={10} />
                    {card.numbered}
                  </span>
                )}
                <span className="px-3 py-1 rounded-full bg-white/5 text-[var(--text-muted)] text-[10px] font-black border border-white/10 uppercase tracking-widest">
                  {card.card_type}
                </span>
              </div>
            </div>

            <div className="absolute top-6 right-6 flex items-center gap-2">
              <button
                onClick={() => setEditing((v) => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border group active:scale-95 ${editing
                  ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                  : 'bg-[var(--accent)] border-[var(--border-accent)] text-[#09090B] shadow-lg shadow-[var(--accent-glow)]'
                  }`}
              >
                {editing ? <X size={14} /> : <Edit2 size={14} className="group-hover:rotate-12 transition-transform" />}
                {editing ? 'Annuler' : 'Modifier'}
              </button>

              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all active:scale-90"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 p-6 custom-scrollbar">
            {!editing ? (
              /* View mode */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  {[
                    { label: 'Année', value: card.year, icon: Clock },
                    { label: 'Marque', value: card.brand, icon: Tag },
                    { label: 'Set', value: card.set_name, icon: Hash },
                    { label: 'Insert', value: card.insert_name, icon: Star },
                    { label: 'Parallel', value: normalizeParallelName(card.parallel_name), icon: Layers },
                    { label: 'RC', value: card.is_rookie ? 'Rookie Card' : null, icon: Trophy },
                    { label: 'N° carte', value: card.card_number, icon: Hash },
                    { label: 'État', value: card.condition_notes || 'Mint / Near Mint', icon: Search },
                    { label: 'Achat', value: card.purchase_price != null ? `${card.purchase_price} €` : null, icon: Euro },
                    { label: 'Vente', value: card.price != null ? `${card.price} €` : null, icon: Tag },
                  ]
                    .filter((item) => item.value)
                    .map((item) => (
                      <div key={item.label} className="flex flex-col gap-1.5 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                          <item.icon size={12} className="opacity-50" />
                          {item.label}
                        </div>
                        <div className="text-sm font-bold text-white truncate">{item.value}</div>
                      </div>
                    ))}
                </div>


                {card.grading_company && (
                  <div className="p-4 rounded-3xl bg-white/[0.03] border border-white/5 space-y-3">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      <Trophy size={14} className="text-[var(--accent)]" />
                      Certification {card.grading_company}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] opacity-40 uppercase font-black mb-1">Grade</div>
                        <div className="text-xl font-black text-[var(--accent)]">{card.grading_grade || 'Pending'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] opacity-40 uppercase font-black mb-1">Status</div>
                        <div className="text-sm font-bold text-white">{card.grading_status ? GRADING_STATUS_LABELS[card.grading_status] : '—'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {!editing && (
                  <div className="flex flex-col gap-3 pt-4">
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(buildPriceSearchText(card));
                          window.open(`https://130point.com/sales/?q=${encodeURIComponent(buildPriceSearchText(card))}`, '_blank');
                        }}
                        className="flex-1 py-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-[var(--text-secondary)] active:scale-95"
                      >
                        <ExternalLink size={14} />
                        130 Point ↗
                      </button>

                      <button
                        onClick={openEbaySold}
                        className="flex-1 py-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-[var(--text-secondary)] active:scale-95"
                      >
                        <ExternalLink size={14} />
                        eBay Sold ↗
                      </button>
                    </div>

                    <EbaySoldItems query={buildPriceSearchText(card)} />

                    <div className="flex gap-3">
                      {card.vinted_url ? (
                        <a
                          href={card.vinted_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-[4] py-4 rounded-2xl text-sm font-black text-center transition-all flex items-center justify-center gap-2 bg-[var(--accent)] text-[#09090B] shadow-xl shadow-[var(--accent-glow)] hover:brightness-110 active:scale-95"
                        >
                          VOIR SUR VINTED
                          <ExternalLink size={16} strokeWidth={3} />
                        </a>
                      ) : (
                        <button
                          onClick={publishToVinted}
                          className="flex-[4] py-4 rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-2 bg-[var(--accent)] text-[#09090B] shadow-xl shadow-[var(--accent-glow)] hover:brightness-110 active:scale-95"
                        >
                          PUBLIER SUR VINTED
                          <ImageIcon size={16} strokeWidth={3} />
                        </button>
                      )}
                      <button
                        onClick={handleDelete}
                        disabled={deleteCard.isPending}
                        className="flex-1 py-4 rounded-2xl text-sm transition-all flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 active:scale-95"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              /* Edit mode */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div
                  className="rounded-3xl p-5 bg-white/5 border border-white/10"
                >
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-2">
                      <Trophy size={16} className="text-[var(--accent)]" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Grading Settings</span>
                    </div>
                    <button
                      onClick={() => setShowGrading((v) => !v)}
                      className="px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border border-white/10 bg-white/5 text-[var(--text-secondary)] flex items-center gap-2"
                    >
                      {showGrading ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {showGrading ? 'MOINS' : 'PLUS D’OPTIONS'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Société</label>
                      <select className={inputCls} value={fields.grading_company} onChange={(e) => set('grading_company', e.target.value)}>
                        <option value="">—</option>
                        {GRADING_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Statut</label>
                      <select className={inputCls} value={fields.grading_status} onChange={(e) => set('grading_status', e.target.value)}>
                        {(Object.entries(GRADING_STATUS_LABELS) as [GradingStatus, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Note</label>
                      <input className={inputCls} value={fields.grading_grade} onChange={(e) => set('grading_grade', e.target.value)} placeholder="10 / 9 / 8.5" />
                    </div>
                  </div>

                  {showGrading && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5"
                    >
                      <div className="col-span-1">
                        <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Certificat #</label>
                        <input className={inputCls} value={fields.grading_cert} onChange={(e) => set('grading_cert', e.target.value)} placeholder="00000000" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Coût Grading (€)</label>
                        <input type="number" className={inputCls} value={fields.grading_cost} onChange={(e) => set('grading_cost', e.target.value)} placeholder="0" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Envoyé le</label>
                        <input type="date" className={inputCls} value={fields.grading_submitted_at} onChange={(e) => set('grading_submitted_at', e.target.value)} />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Reçu le</label>
                        <input type="date" className={inputCls} value={fields.grading_returned_at} onChange={(e) => set('grading_returned_at', e.target.value)} />
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                      <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">{label}</label>
                      <input className={inputCls} value={fields[key]} onChange={(e) => set(key, e.target.value)} />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Type</label>
                    <select className={inputCls} value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
                      <option value="">—</option>
                      {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Statut</label>
                    <select className={inputCls} value={fields.status} onChange={(e) => set('status', e.target.value)}>
                      <option value="collection">Collection</option>
                      <option value="a_vendre">À vendre</option>
                      <option value="reserve">Réservé</option>
                      <option value="vendu">Vendu</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] uppercase tracking-wider font-bold mb-1.5 opacity-50">Notes d'état</label>
                    <input className={inputCls} value={fields.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} />
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <button
                    onClick={handleReanalyze}
                    disabled={identify.isPending}
                    className="w-full py-3.5 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-3 bg-white/5 border border-white/10 hover:bg-white/10 text-[var(--text-secondary)] active:scale-95"
                  >
                    {identify.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                    {identify.isPending ? 'ANALYSE EN COURS…' : 'RÉ-ANALYSER AVEC L’IA'}
                  </button>

                  {reanalyzeError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
                      <AlertCircle size={14} />
                      {reanalyzeError}
                    </div>
                  )}

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-4 rounded-2xl text-sm font-black transition-all flex items-center justify-center gap-2 bg-[var(--accent)] text-[#09090B] shadow-xl shadow-[var(--accent-glow)] hover:brightness-110 active:scale-95"
                  >
                    {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? 'ENREGISTREMENT…' : 'ENREGISTRER LES MODIFICATIONS'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>

    <AnimatePresence>
    {lightboxSide && (() => {
      const urls = [card.image_front_url, card.image_back_url].filter(Boolean) as string[];
      const currentUrl = lightboxSide === 'front' ? card.image_front_url : card.image_back_url;
      const canPrev = lightboxSide === 'back' && !!card.image_front_url;
      const canNext = lightboxSide === 'front' && !!card.image_back_url;
      void urls;
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl"
          onClick={() => setLightboxSide(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setLightboxSide(null);
            if (e.key === 'ArrowLeft' && canPrev) setLightboxSide('front');
            if (e.key === 'ArrowRight' && canNext) setLightboxSide('back');
          }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <motion.img
            key={lightboxSide}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            src={currentUrl ?? ''}
            alt=""
            className="max-h-[90vh] max-w-[80vw] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {canPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxSide('front'); }}
              className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          {canNext && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxSide('back'); }}
              className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all"
            >
              <ChevronRight size={24} />
            </button>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {card.image_front_url && (
              <button onClick={(e) => { e.stopPropagation(); setLightboxSide('front'); }}
                className={`w-2 h-2 rounded-full transition-all ${lightboxSide === 'front' ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/60'}`}
              />
            )}
            {card.image_back_url && (
              <button onClick={(e) => { e.stopPropagation(); setLightboxSide('back'); }}
                className={`w-2 h-2 rounded-full transition-all ${lightboxSide === 'back' ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/60'}`}
              />
            )}
          </div>

          <button
            onClick={() => setLightboxSide(null)}
            className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            <X size={20} />
          </button>
        </motion.div>
      );
    })()}
    </AnimatePresence>
    </>
  );
}
