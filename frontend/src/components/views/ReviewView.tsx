import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Trash2,
  X,
  Maximize2,
  Star,
  ImageOff,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Wand2,
  Sparkles,
} from 'lucide-react';
import { useCards, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useIdentify } from '../../hooks/useIdentify';
import { useAppStore } from '../../stores/appStore';
import { getStudioSession } from '../../lib/studioSessions';
import { normalizeParallelName } from '../../lib/cardQuality';
import { buildSimilarityPrefill, findDuplicateMatches } from '../../lib/cardSimilarity';
import { SPORTS, type Card, type CardStatus, type CardType, type Sport } from '../../types';
import { RookieBadge } from '../shared/RookieBadge';
import { AlertChips, ConfidenceBadge } from '../shared/CardSignals';
import { Badge, EmptyState, Field, Notice, Page, PageHeader, Panel, Spinner } from '../ui';

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain"
      />
      <button
        className="ui-btn ui-btn-icon absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)]"
        onClick={onClose}
        aria-label="Fermer"
      >
        <X size={18} />
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

function DraftEditor({
  card,
  index,
  total,
  cards,
  onNavigate,
  onValidate,
  onDiscard,
}: {
  card: Card;
  index: number;
  total: number;
  cards: Card[];
  onNavigate: (nextIndex: number) => void;
  onValidate: (id: string, fields: Partial<Card>) => Promise<void>;
  onDiscard: (id: string) => Promise<void>;
}) {
  // Use the card directly in the state initialization, and use a key on DraftEditor to reset it
  const [fields, setFields] = useState({
    sport: card.sport ?? 'Basket' as Sport,
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
  const identify = useIdentify();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');

  async function handleRetryAI() {
    if (!card.image_front_url || !card.image_back_url) {
      setRetryError('Photos recto/verso manquantes.');
      return;
    }
    setRetrying(true);
    setRetryError('');
    try {
      async function urlToFile(url: string, name: string): Promise<File> {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Image illisible');
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
        sport: r.sport || prev.sport,
        player: r.player || prev.player,
        team: r.team || prev.team,
        year: r.year || prev.year,
        brand: r.brand || prev.brand,
        set_name: r.set || prev.set_name,
        card_type: (r.card_type || prev.card_type) as typeof prev.card_type,
        insert_name: r.insert || prev.insert_name,
        parallel_name: r.parallel || prev.parallel_name,
        card_number: r.card_number || prev.card_number,
        numbered: r.numbered || prev.numbered,
        is_rookie: r.is_rookie ?? prev.is_rookie,
        condition_notes: r.condition_notes || prev.condition_notes,
      }));
    } catch (e) {
      setRetryError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  const signalCard: Partial<Card> = {
    ...card,
    ...fields,
    parallel_name: normalizeParallelName(fields.parallel_name),
    card_type: (fields.card_type || null) as CardType | null,
    price: fields.price ? parseFloat(fields.price) : null,
    purchase_price: fields.purchase_price ? parseFloat(fields.purchase_price) : null,
  };
  const duplicateMatches = useMemo(() => findDuplicateMatches(card, cards), [card, cards]);
  const prefill = useMemo(() => buildSimilarityPrefill(card, cards), [card, cards]);

  function set(key: keyof typeof fields, value: string | boolean) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function applyPrefill() {
    if (!prefill) return;
    setFields((prev) => ({
      ...prev,
      year: (prefill.year as string | null) ?? prev.year,
      brand: (prefill.brand as string | null) ?? prev.brand,
      set_name: (prefill.set_name as string | null) ?? prev.set_name,
      team: (prefill.team as string | null) ?? prev.team,
      card_type: (prefill.card_type as CardType | null) ?? prev.card_type,
    }));
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]"
    >
      {/* Photos et aperçu */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <Panel padded={false}>
          <div className="grid grid-cols-2 gap-2 p-2">
            {[
              { url: card.image_front_url, label: 'Recto' },
              { url: card.image_back_url, label: 'Verso' }
            ].map((side, i) => (
              <div key={i} className="group relative aspect-[3/4] overflow-hidden rounded-lg bg-[var(--bg-elevated)]">
                {side.url ? (
                  <>
                    <img src={side.url} alt={side.label} className="h-full w-full object-contain" />
                    <button
                      onClick={() => setLightbox(side.url!)}
                      className="absolute inset-0 flex cursor-zoom-in items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`Agrandir le ${side.label.toLowerCase()}`}
                    >
                      <Maximize2 size={20} className="text-white" />
                    </button>
                    <span className="pointer-events-none absolute bottom-2 left-2"><Badge>{side.label}</Badge></span>
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <ImageOff size={18} />
                    Pas de {side.label.toLowerCase()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{fields.player || 'Joueur inconnu'}</h3>
                <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                  {[fields.year, fields.brand, fields.set_name].filter(Boolean).join(' · ') || 'Set non renseigné'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {fields.is_rookie && <RookieBadge compact />}
                {fields.numbered && <Badge tone="accent">{fields.numbered}</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceBadge card={signalCard} />
            </div>
            <AlertChips card={signalCard} />

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={handleRetryAI}
                disabled={retrying || !card.image_front_url || !card.image_back_url}
                className="ui-btn w-full"
              >
                {retrying ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {retrying ? 'Analyse IA…' : "Réessayer l'IA"}
              </button>
              {retrying && (
                <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--accent)]" />
                </div>
              )}
              {prefill && (
                <button type="button" onClick={applyPrefill} className="ui-btn w-full">
                  <Wand2 size={15} /> Préremplir depuis cartes similaires
                </button>
              )}
            </div>

            {retryError && <Notice tone="error" icon={AlertCircle}>{retryError}</Notice>}
            {duplicateMatches.length > 0 && (
              <Notice tone="error" icon={AlertTriangle}>
                <p className="font-medium">Doublons probables</p>
                <ul className="mt-1 space-y-1 text-xs opacity-90">
                  {duplicateMatches.map((match) => (
                    <li key={match.card.id}>
                      {match.reason} · {match.card.player} · {match.card.year} · {match.card.set_name} · score <span className="tabular">{match.score}</span>
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
          </div>
        </Panel>
      </div>

      {/* Fiche éditable */}
      <div className="space-y-4">
        <Panel title="Fiche de la carte">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Sport">
                <select className="ui-select" value={fields.sport} onChange={(e) => set('sport', e.target.value)}>
                  {SPORTS.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
                </select>
              </Field>
              <Field label="Joueur">
                <input className="ui-input" value={fields.player} onChange={(e) => set('player', e.target.value)} placeholder="ex: LeBron James" />
              </Field>
              <Field label="Équipe">
                <input className="ui-input" value={fields.team} onChange={(e) => set('team', e.target.value)} placeholder="ex: Lakers" />
              </Field>
              <Field label="Année">
                <input className="ui-input" value={fields.year} onChange={(e) => set('year', e.target.value)} placeholder="2024-25" />
              </Field>
              <Field label="Marque">
                <input className="ui-input" value={fields.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Panini" />
              </Field>
              <Field label="Set">
                <input className="ui-input" value={fields.set_name} onChange={(e) => set('set_name', e.target.value)} placeholder="Prizm" />
              </Field>
              <Field label="Insert">
                <input className="ui-input" value={fields.insert_name} onChange={(e) => set('insert_name', e.target.value)} placeholder="Downtown" />
              </Field>
              <Field label="Parallel">
                <input
                  className="ui-input"
                  value={fields.parallel_name}
                  onChange={(e) => set('parallel_name', e.target.value)}
                  onBlur={() => set('parallel_name', normalizeParallelName(fields.parallel_name) ?? '')}
                  placeholder="Silver"
                />
              </Field>
              <Field label="Type">
                <select className="ui-select" value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
                  <option value="">—</option>
                  {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="N° carte">
                <input className="ui-input" value={fields.card_number} onChange={(e) => set('card_number', e.target.value)} placeholder="#23" />
              </Field>
              <Field label="Tirage">
                <input className="ui-input" value={fields.numbered} onChange={(e) => set('numbered', e.target.value)} placeholder="/99" />
              </Field>
              <Field label="Statut final">
                <select className="ui-select" value={fields.status} onChange={(e) => set('status', e.target.value as Exclude<CardStatus, 'draft'>)}>
                  {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </Field>
              <Field label="Prix d’achat (€)">
                <input type="number" className="ui-input tabular" value={fields.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} placeholder="0" />
              </Field>
              <Field label="Prix estimé (€)">
                <input type="number" className="ui-input tabular" value={fields.price} onChange={(e) => set('price', e.target.value)} placeholder="0" />
              </Field>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={fields.is_rookie}
              onClick={() => set('is_rookie', !fields.is_rookie)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
                <Star size={15} className={fields.is_rookie ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
                {fields.is_rookie ? 'Rookie card' : 'Non RC'}
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${fields.is_rookie ? 'bg-[var(--accent)]' : 'bg-[var(--bg-hover)]'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${fields.is_rookie ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
            </button>

            <Field label="Note d'état">
              <input className="ui-input" value={fields.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} placeholder="ex: Near Mint, Perfect Centering..." />
            </Field>
          </div>
        </Panel>

        {/* Navigation et actions */}
        <div className="ui-card flex items-center justify-between gap-2 p-3">
          <div className="flex gap-2">
            <button
              onClick={() => onNavigate(index - 1)}
              disabled={index === 0}
              className="ui-btn ui-btn-icon"
              aria-label="Brouillon précédent"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => onNavigate(index + 1)}
              disabled={index >= total - 1}
              className="ui-btn ui-btn-icon"
              aria-label="Brouillon suivant"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex flex-1 justify-end gap-2">
            <button
              onClick={handleDiscardAndNext}
              disabled={discarding}
              className="ui-btn ui-btn-danger"
              title="Supprimer ce brouillon"
            >
              {discarding ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
              <span className="hidden sm:inline">Supprimer</span>
            </button>
            <button
              onClick={handleValidateAndNext}
              disabled={saving}
              className="ui-btn ui-btn-primary sm:min-w-40"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {saving ? 'Validation…' : index < total - 1 ? 'Valider et suivant' : 'Valider et terminer'}
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
      <Page>
        <Spinner label="Chargement des brouillons…" />
      </Page>
    );
  }

  if (drafts.length === 0) {
    return (
      <Page>
        <EmptyState
          icon={CheckCircle2}
          title="Vérification terminée"
          description="Tous vos brouillons ont été traités."
          action={
            <button
              onClick={() => { setReviewSessionId(null); setActiveView('collection'); }}
              className="ui-btn ui-btn-primary"
            >
              Retourner à la collection <ArrowRight size={15} />
            </button>
          }
        />
      </Page>
    );
  }

  const safeIndex = Math.min(currentIndex, Math.max(0, drafts.length - 1));
  const current = drafts[safeIndex];

  return (
    <Page width="wide">
      <PageHeader
        title={<span className="flex items-center gap-2">Vérification studio <Badge tone="accent" className="tabular">{drafts.length}</Badge></span>}
        subtitle={reviewSession ? `${reviewSession.tag} · lot studio récent` : 'Validez ou corrigez les données extraites par l\'IA'}
        actions={
          <>
            <button
              onClick={() => { setReviewSessionId(null); setActiveView('batch'); }}
              className="ui-btn ui-btn-ghost"
            >
              <ChevronLeft size={16} /> Retour
            </button>
            <button
              onClick={handleValidateAll}
              disabled={validatingAll}
              className="ui-btn ui-btn-success"
            >
              {validatingAll ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {validatingAll ? 'Traitement en cours…' : `Tout valider (${drafts.length})`}
            </button>
          </>
        }
      />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span className="tabular">Brouillon {safeIndex + 1} sur {drafts.length}</span>
          <span className="lg:hidden tabular">{drafts.length} à vérifier</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round(((safeIndex + 1) / drafts.length) * 100)}%` }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {current && (
          <DraftEditor
            key={current.id}
            card={current}
            index={safeIndex}
            total={drafts.length}
            cards={drafts}
            onNavigate={setCurrentIndex}
            onValidate={handleValidate}
            onDiscard={handleDiscard}
          />
        )}
      </AnimatePresence>
    </Page>
  );
}
