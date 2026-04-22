import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Trash2,
  X,
  Maximize2,
  Info,
  Calendar,
  Layers,
  Star,
  Euro,
  Hash,
  Tag,
  Clock,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { useCards, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import { getStudioSession } from '../../lib/studioSessions';
import type { Card, CardStatus, CardType } from '../../types';
import { RookieBadge } from '../shared/RookieBadge';

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.img
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
      />
      <button
        className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-all active:scale-90"
        onClick={onClose}
      >
        <X size={24} />
      </button>
    </motion.div>
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

const STATUS_OPTIONS: { value: Exclude<CardStatus, 'draft'>; label: string }[] = [
  { value: 'collection', label: 'Collection' },
  { value: 'a_vendre', label: 'À vendre' },
  { value: 'reserve', label: 'Réservé' },
  { value: 'vendu', label: 'Vendu' },
];

const inputCls = 'w-full rounded-xl px-3 py-2.5 text-[13px] font-medium outline-none transition-all bg-white/5 border border-white/10 focus:border-[var(--accent)]/50 focus:bg-white/10 placeholder:text-white/20';

function Field({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 ml-1">
        {Icon && <Icon size={10} className="text-[var(--text-muted)]" />}
        <label className="block text-[10px] font-black tracking-[0.15em] uppercase text-[var(--text-muted)]">
          {label}
        </label>
      </div>
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
  // Use the card directly in the state initialization, and use a key on DraftEditor to reset it
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
    onNavigate(index >= total - 1 ? Math.max(0, index - 1) : index);
  }

  async function handleDiscardAndNext() {
    setDiscarding(true);
    await onDiscard(card.id);
    setDiscarding(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="grid lg:grid-cols-[400px_1fr] gap-8"
    >
      {/* Visual Side */}
      <div className="space-y-6">
        <div className="panel p-2 rounded-[32px] bg-white/[0.02] border border-white/10 overflow-hidden">
          <div className="grid grid-cols-2 gap-2">
            {[
              { url: card.image_front_url, label: 'RECTO' },
              { url: card.image_back_url, label: 'VERSO' }
            ].map((side, i) => (
              <div key={i} className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-white/5 border border-white/5 group">
                {side.url ? (
                  <>
                    <img src={side.url} alt={side.label} className="w-full h-full object-contain cursor-zoom-in transition-transform duration-500 group-hover:scale-105" />
                    <button
                      onClick={() => setLightbox(side.url!)}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <Maximize2 size={24} className="text-white" />
                    </button>
                    <div className="absolute bottom-3 left-3 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-black tracking-widest text-white/70">
                      {side.label}
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-20">
                    <Clock size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">NO {side.label}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6 rounded-3xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Aperçu Réel</span>
            <div className="flex gap-2">
              {fields.is_rookie && <RookieBadge compact />}
              {fields.numbered && (
                <div className="px-2 py-0.5 rounded-lg bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent)] text-[10px] font-black">
                  {fields.numbered}
                </div>
              )}
            </div>
          </div>
          <h3 className="text-xl font-black text-white tracking-tight leading-tight">{fields.player || 'Joueur Inconnu'}</h3>
          <p className="text-sm text-[var(--text-muted)] font-bold mt-1 uppercase tracking-wide">
            {fields.year} {fields.brand} {fields.set_name}
          </p>
        </div>
      </div>

      {/* Editor Side */}
      <div className="space-y-6">
        <div className="panel p-8 rounded-[32px] bg-white/[0.02] border border-white/10 space-y-8">
          <div className="grid sm:grid-cols-2 gap-6">
            <Field label="Joueur" icon={Tag}>
              <input className={inputCls} value={fields.player} onChange={(e) => set('player', e.target.value)} placeholder="ex: LeBron James" />
            </Field>
            <Field label="Équipe" icon={Tag}>
              <input className={inputCls} value={fields.team} onChange={(e) => set('team', e.target.value)} placeholder="ex: Lakers" />
            </Field>
            <Field label="Année" icon={Calendar}>
              <input className={inputCls} value={fields.year} onChange={(e) => set('year', e.target.value)} placeholder="2024-25" />
            </Field>
            <Field label="Marque" icon={Layers}>
              <input className={inputCls} value={fields.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Panini" />
            </Field>
            <Field label="Set" icon={Layers}>
              <input className={inputCls} value={fields.set_name} onChange={(e) => set('set_name', e.target.value)} placeholder="Prizm" />
            </Field>
            <Field label="Insert" icon={Star}>
              <input className={inputCls} value={fields.insert_name} onChange={(e) => set('insert_name', e.target.value)} placeholder="Downtown" />
            </Field>
            <Field label="Parallel" icon={Star}>
              <input className={inputCls} value={fields.parallel_name} onChange={(e) => set('parallel_name', e.target.value)} placeholder="Silver" />
            </Field>
            <Field label="Type" icon={Info}>
              <select className={inputCls} value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
                <option value="">—</option>
                {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="N° Carte" icon={Hash}>
              <input className={inputCls} value={fields.card_number} onChange={(e) => set('card_number', e.target.value)} placeholder="#23" />
            </Field>
            <Field label="Tirage" icon={Hash}>
              <input className={inputCls} value={fields.numbered} onChange={(e) => set('numbered', e.target.value)} placeholder="/99" />
            </Field>
            <Field label="Achat ($)" icon={Euro}>
              <input type="number" className={inputCls} value={fields.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Estimé ($)" icon={Euro}>
              <input type="number" className={inputCls} value={fields.price} onChange={(e) => set('price', e.target.value)} placeholder="0" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Field label="Rookie Status" icon={Star}>
              <button
                type="button"
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${fields.is_rookie
                  ? 'bg-[var(--accent-dim)] border-[var(--border-accent)] text-[var(--accent)]'
                  : 'bg-white/5 border-white/10 text-white/40'
                  }`}
                onClick={() => set('is_rookie', !fields.is_rookie)}
              >
                <span className="text-xs font-bold uppercase tracking-widest">{fields.is_rookie ? 'Rookie CARD' : 'Non RC'}</span>
                <div className={`w-8 h-4 rounded-full relative ${fields.is_rookie ? 'bg-[var(--accent)]' : 'bg-white/10'}`}>
                  <div className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white transition-all ${fields.is_rookie ? 'right-1' : 'right-4.5 opacity-30'}`} />
                </div>
              </button>
            </Field>
            <Field label="Statut Final" icon={Info}>
              <select className={inputCls} value={fields.status} onChange={(e) => set('status', e.target.value as Exclude<CardStatus, 'draft'>)}>
                {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Note d'état" icon={Clock}>
            <input className={inputCls} value={fields.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} placeholder="ex: Near Mint, Perfect Centering..." />
          </Field>
        </div>

        {/* Navigation & Actions */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-3xl bg-white/[0.01] border border-white/5">
          <div className="flex gap-2">
            <button
              onClick={() => onNavigate(index - 1)}
              disabled={index === 0}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => onNavigate(index + 1)}
              disabled={index >= total - 1}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-90"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex gap-3 flex-1 justify-end">
            <button
              onClick={handleDiscardAndNext}
              disabled={discarding}
              className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-all active:scale-95 disabled:opacity-50"
            >
              {discarding ? '...' : <Trash2 size={18} />}
            </button>
            <button
              onClick={handleValidateAndNext}
              disabled={saving}
              className="px-8 py-3 rounded-2xl bg-[var(--accent)] border border-[var(--border-accent)] text-[#09090B] text-xs font-black uppercase tracking-widest flex items-center gap-3 shadow-xl shadow-[var(--accent-glow)] hover:brightness-110 transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              {saving ? 'Validation…' : index < total - 1 ? 'Suivant' : 'Terminer'}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}

export function ReviewView() {
  const { data: cards = [], isLoading } = useCards();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const reviewSessionId = useAppStore((s) => s.reviewSessionId);
  const setReviewSessionId = useAppStore((s) => s.setReviewSessionId);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [validatingAll, setValidatingAll] = useState(false);

  const reviewSession = useMemo(() => getStudioSession(reviewSessionId), [reviewSessionId]);
  const drafts = useMemo(() => {
    const allDrafts = cards.filter((c) => c.status === 'draft');
    if (!reviewSession) return allDrafts;
    const ids = new Set(reviewSession.cardIds);
    return allDrafts.filter((c) => ids.has(c.id));
  }, [cards, reviewSession]);

  // Handle case where drafts are deleted and index becomes invalid
  useEffect(() => {
    if (drafts.length > 0 && currentIndex >= drafts.length) {
      setCurrentIndex(drafts.length - 1);
    }
  }, [drafts.length, currentIndex]);

  async function handleValidate(id: string, fields: Partial<Card>) {
    await updateCard.mutateAsync({ id, ...fields, status: fields.status ?? 'collection' });
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
    setReviewSessionId(null);
    setActiveView('collection');
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={40} className="text-[var(--accent)] animate-spin opacity-20" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-6"
        >
          <div className="w-20 h-20 rounded-[32px] bg-[var(--accent-dim)] border border-[var(--border-accent)] flex items-center justify-center mx-auto text-[var(--accent)]">
            <CheckCircle2 size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Vérification Terminée</h2>
            <p className="text-[var(--text-muted)] font-medium mt-1">Tous vos brouillons ont été traités avec succès.</p>
          </div>
          <button
            onClick={() => { setReviewSessionId(null); setActiveView('collection'); }}
            className="px-8 py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-3 mx-auto"
          >
            Retourner à la collection <ArrowRight size={16} />
          </button>
        </motion.div>
      </div>
    );
  }

  const safeIndex = Math.min(currentIndex, Math.max(0, drafts.length - 1));
  const current = drafts[safeIndex];

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setReviewSessionId(null); setActiveView('batch'); }}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[var(--text-muted)] hover:text-white transition-all active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white tracking-tight">Vérification Studio</h2>
                <div className="px-2.5 py-0.5 rounded-lg bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent)] text-xs font-black">
                  {drafts.length}
                </div>
              </div>
              <p className="text-sm text-[var(--text-muted)] font-medium">
                {reviewSession ? `${reviewSession.tag} • lot studio récent` : 'Validez ou corrigez les données extraites par l\'IA'}
              </p>
            </div>
          </div>

          <button
            onClick={handleValidateAll}
            disabled={validatingAll}
            className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-30 transition-all active:scale-95"
          >
            {validatingAll ? 'TRAITEMENT EN COURS…' : `Tout valider`}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {current && (
            <DraftEditor
              key={current.id}
              card={current}
              index={safeIndex}
              total={drafts.length}
              onNavigate={setCurrentIndex}
              onValidate={handleValidate}
              onDiscard={handleDiscard}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
