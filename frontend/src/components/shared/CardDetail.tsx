import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  X,
  Trash2,
  Pencil,
  Save,
  Camera,
  Download,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  ImagePlus,
  AlertCircle,
  Hash,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { SPORTS, type Card, type CardType, type GradingCompany, type GradingStatus, type Sport } from '../../types';
import { GradingBadge } from './GradingBadge';
import { StatusBadge } from './StatusBadge';
import { CardBadge } from './CardBadge';
import { useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useFolders } from '../../hooks/useFolders';
import { useIdentify } from '../../hooks/useIdentify';
import { EbaySoldItems } from './EbaySoldItems';
import { EbayPublishModal } from './EbayPublishModal';
import { EbayLogo, VintedLogo } from './EbayLogo';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/storage';
import { cdnImg } from '../../lib/cdn';
import { RookieBadge } from './RookieBadge';
import { formatCardNumber, normalizeParallelName } from '../../lib/cardQuality';
import { apiFetch } from '../../api/client';
import { downloadImage } from '../../lib/downloadImage';
import { formatVintedNumberedBadge } from '../../lib/vintedPhotoBadge';
import { calculateEbayPrice } from '../../lib/marketplacePricing';
import { buildVintedDraft, openVintedDraft, type VintedDraft } from '../../lib/vintedDraft';
import { Badge, Field, Modal, Notice } from '../ui';



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
  return [
    card.player,
    card.year,
    card.set_name || card.brand,
    formatCardNumber(card.card_number),
    card.insert_name,
    card.parallel_name,
    card.numbered,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function buildPhotoFilename(card: Card, side: 'front' | 'back'): string {
  const base = [card.player, card.year, card.set_name || card.brand, card.card_number]
    .filter(Boolean)
    .join(' ');
  const slug = slugify(base) || 'carte';
  return `${slug}_${side === 'front' ? 'recto' : 'verso'}.jpg`;
}

type Side = 'front' | 'back';
const SIDES: Side[] = ['front', 'back'];
const SIDE_LABEL: Record<Side, string> = { front: 'Recto', back: 'Verso' };

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
function formatEuro(v: number): string {
  return euro.format(v);
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Libellé de section court (seul usage toléré des majuscules espacées). */
function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{children}</h3>
      {action}
    </div>
  );
}

/** Ligne marketplace : logo, prix, état en ligne, actions. */
function MarketRow({ logo, label, price, live, children }: { logo: ReactNode; label: string; price: number | null; live: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span className="flex w-14 shrink-0 items-center" title={label}>{logo}</span>
      <div className="min-w-0 flex-1">
        <div className={`tabular text-sm font-semibold ${price != null ? 'text-[var(--price)]' : 'text-[var(--text-muted)]'}`}>
          {price != null ? formatEuro(price) : '—'}
        </div>
        {live && (
          <div className="flex items-center gap-1 text-[11px] text-[var(--green)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
            En ligne
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Visionneuse plein écran : bascule recto/verso (boutons, flèches du clavier),
 * zoom au clic (le point zoomé suit le pointeur), téléchargement.
 */
function Lightbox({ card, side, onSide, onClose }: { card: Card; side: Side; onSide: (s: Side) => void; onClose: () => void }) {
  const [zoom, setZoom] = useState<{ side: Side; x: number; y: number } | null>(null);
  const zoomed = zoom?.side === side;
  const currentUrl = side === 'front' ? card.image_front_url : card.image_back_url;
  const canPrev = side === 'back' && !!card.image_front_url;
  const canNext = side === 'front' && !!card.image_back_url;
  const hasBoth = !!card.image_front_url && !!card.image_back_url;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (zoomed) setZoom(null);
        else onClose();
      }
      if (e.key === 'ArrowLeft' && canPrev) onSide('front');
      if (e.key === 'ArrowRight' && canNext) onSide('back');
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoomed, canPrev, canNext, onClose, onSide]);

  function pointAt(e: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      side,
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex flex-col dark-scope bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo en plein écran"
    >
      <div
        className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {hasBoth ? (
          <div className="ui-segmented">
            {SIDES.map((s) => (
              <button key={s} data-active={side === s} onClick={() => onSide(s)}>
                {SIDE_LABEL[s]}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">{SIDE_LABEL[side]}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setZoom(zoomed ? null : { side, x: 50, y: 50 })}
            title={zoomed ? 'Dézoomer' : 'Zoomer'}
            aria-label={zoomed ? 'Dézoomer' : 'Zoomer'}
            data-active={zoomed}
            className="ui-btn ui-btn-icon"
          >
            {zoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
          </button>
          <button
            onClick={() => {
              if (currentUrl && side) {
                downloadImage(currentUrl, buildPhotoFilename(card, side));
              }
            }}
            title="Télécharger cette photo"
            aria-label="Télécharger cette photo"
            className="ui-btn ui-btn-icon"
          >
            <Download size={16} />
          </button>
          <button onClick={onClose} title="Fermer" aria-label="Fermer" className="ui-btn ui-btn-icon">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-20">
        <div
          className={`overflow-hidden rounded-lg ${zoomed ? 'cursor-zoom-out touch-none' : 'cursor-zoom-in'}`}
          onClick={(e) => {
            e.stopPropagation();
            setZoom(zoomed ? null : pointAt(e));
          }}
          onPointerMove={(e) => {
            if (zoomed) setZoom(pointAt(e));
          }}
        >
          <img
            key={side}
            src={cdnImg(currentUrl) ?? ''}
            alt={`${card.player ?? 'Carte'} (${SIDE_LABEL[side].toLowerCase()})`}
            decoding="async"
            draggable={false}
            className="block max-h-[calc(100dvh-7rem)] max-w-[calc(100vw-2rem)] select-none object-contain transition-transform duration-150 ease-out sm:max-w-[calc(100vw-10rem)]"
            style={{
              transform: zoomed ? 'scale(2.5)' : 'none',
              transformOrigin: zoomed && zoom ? `${zoom.x}% ${zoom.y}%` : 'center',
            }}
          />
        </div>

        {canPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onSide('front'); }}
            aria-label="Voir le recto"
            className="ui-btn ui-btn-icon absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 sm:inline-flex"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {canNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onSide('back'); }}
            aria-label="Voir le verso"
            className="ui-btn ui-btn-icon absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 sm:inline-flex"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

interface Props {
  card: Card;
  onClose: () => void;
}

export function CardDetail({ card, onClose }: Props) {
  const deleteCard = useDeleteCard();
  const updateCard = useUpdateCard();
  const identify = useIdentify();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ebaySyncNotice, setEbaySyncNotice] = useState<string | null>(null);
  const [reanalyzeError, setReanalyzeError] = useState('');
  const [dragOver, setDragOver] = useState<'front' | 'back' | null>(null);
  const [uploadingImage, setUploadingImage] = useState<'front' | 'back' | null>(null);
  const [showGrading, setShowGrading] = useState(false);
  const [lightboxSide, setLightboxSide] = useState<'front' | 'back' | null>(null);
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);
  const [showEbayPublish, setShowEbayPublish] = useState(false);
  const [withdrawingEbay, setWithdrawingEbay] = useState(false);
  const [ebayError, setEbayError] = useState('');
  const [vintedPreview, setVintedPreview] = useState<{ image: string; payload: VintedDraft } | null>(null);

  async function withdrawFromEbay() {
    setWithdrawingEbay(true);
    setEbayError('');
    try {
      await apiFetch(`/ebay/selling/withdraw/${card.id}`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
    } catch (e) {
      setEbayError((e as Error).message);
    } finally {
      setWithdrawingEbay(false);
    }
  }
  const { data: folders = [] } = useFolders();
  const [folderIds, setFolderIds] = useState<string[]>(card.folder_ids ?? []);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
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
    status: card.status,
    purchase_price: card.purchase_price?.toString() ?? '',
    price: card.price?.toString() ?? '',
    vinted_price: (card.vinted_price ?? card.price)?.toString() ?? '',
    ebay_price: (card.ebay_price ?? card.price)?.toString() ?? '',
    vinted_url: card.vinted_url ?? '',
    ebay_url: card.ebay_url ?? '',
    quantity: card.quantity?.toString() ?? '',
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

  function recalculateEbayPrice() {
    const vintedPrice = parseFloat(fields.vinted_price);
    if (!Number.isFinite(vintedPrice)) return;
    const result = calculateEbayPrice({
      vintedPrice,
    });
    set('ebay_price', result.ebayPrice.toString());
  }

  async function handleSave() {
    setSaving(true);
    setEbaySyncNotice(null);
    const updated = await updateCard.mutateAsync({
      id: card.id,
      ...fields,
      sport: fields.sport,
      card_type: (fields.card_type || null) as CardType | null,
      purchase_price: fields.purchase_price ? parseFloat(fields.purchase_price) : null,
      price: fields.vinted_price ? parseFloat(fields.vinted_price) : null,
      vinted_price: fields.vinted_price ? parseFloat(fields.vinted_price) : null,
      ebay_price: fields.ebay_price ? parseFloat(fields.ebay_price) : null,
      vinted_url: fields.vinted_url || null,
      ebay_url: fields.ebay_url || null,
      quantity: fields.quantity ? parseInt(fields.quantity, 10) : null,
      folder_ids: folderIds,
      is_rookie: fields.is_rookie,
      grading_company: (fields.grading_company || null) as GradingCompany | null,
      grading_status: (fields.grading_status || null) as GradingStatus | null,
      grading_grade: fields.grading_grade || null,
      grading_cert: fields.grading_cert || null,
      grading_submitted_at: fields.grading_submitted_at || null,
      grading_returned_at: fields.grading_returned_at || null,
      grading_cost: fields.grading_cost ? parseFloat(fields.grading_cost) : null,
    });
    // Le backend répercute le stock sur l'annonce eBay en ligne (best-effort) :
    // la carte est enregistrée quoi qu'il arrive, on signale juste l'échec.
    const sync = updated?.ebay_quantity_sync;
    if (sync && !sync.ok) {
      setEbaySyncNotice(`Stock enregistré, mais l'annonce eBay n'a pas pu être mise à jour : ${sync.error}`);
    }
    setSaving(false);
    setEditing(false);
  }


  function openEbaySold() {
    const text = buildPriceSearchText(card);
    const query = encodeURIComponent(text).replace(/%20/g, '+');
    window.open(`https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1`, '_blank');
  }

  async function publishToVinted() {
    const draft = await buildVintedDraft(card);
    if (card.numbered && draft.photos[0]) {
      setVintedPreview({ image: draft.photos[0], payload: draft });
      return;
    }
    openVintedDraft(draft);
  }

  async function handleReanalyze() {
    if (!card.image_front_url) return;
    setReanalyzeError('');
    try {
      const r = await identify.mutateAsync({ cardId: card.id });
      setFields((prev) => ({
        ...prev,
        sport: r.sport || prev.sport,
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

  async function handleDownloadPhotos() {
    if (downloadingPhotos) return;
    setDownloadingPhotos(true);
    try {
      if (card.image_front_url) {
        await downloadImage(card.image_front_url, buildPhotoFilename(card, 'front'));
      }
      if (card.image_back_url) {
        await downloadImage(card.image_back_url, buildPhotoFilename(card, 'back'));
      }
    } catch {
      // échec silencieux : on ne bloque pas l'UI
    } finally {
      setDownloadingPhotos(false);
    }
  }

  /* ── Présentation ─────────────────────────────────────────── */

  const [side, setSide] = useState<Side>(card.image_front_url || !card.image_back_url ? 'front' : 'back');
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayOpen = lightboxSide != null || vintedPreview != null || showEbayPublish;

  // Verrouille le défilement de la page tant que la fiche est ouverte.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Échap ferme la fiche, sauf si une surcouche (plein écran, aperçu, eBay) est ouverte.
  useEffect(() => {
    if (overlayOpen || saving) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlayOpen, saving, onClose]);

  const urlOf = (s: Side) => (s === 'front' ? card.image_front_url : card.image_back_url);
  const inputRefOf = (s: Side) => (s === 'front' ? frontInputRef : backInputRef);
  const dropProps = (s: Side) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => { if (!editing) return; e.preventDefault(); setDragOver(s); },
    onDragLeave: () => { if (editing) setDragOver(null); },
    onDrop: (e: DragEvent<HTMLElement>) => { if (!editing) return; e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleImageUpload(f, s); },
  });
  const shownUrl = urlOf(side);
  const hasAnyPhoto = !!(card.image_front_url || card.image_back_url);
  const subtitle = [card.team, card.year].filter(Boolean).join(' · ');
  const vintedPrice = card.vinted_price ?? card.price;

  const details: { label: string; value: string | null | undefined; num?: boolean }[] = [
    { label: 'Sport', value: card.sport },
    { label: 'Marque', value: card.brand },
    { label: 'Set', value: card.set_name },
    { label: 'Insert', value: card.insert_name },
    { label: 'Parallel', value: normalizeParallelName(card.parallel_name) },
    { label: 'N° carte', value: formatCardNumber(card.card_number), num: true },
    { label: 'Tirage', value: card.numbered, num: true },
    { label: 'Rookie', value: card.is_rookie ? 'Oui' : null },
    { label: 'Quantité', value: (card.quantity ?? 1) > 1 ? String(card.quantity) : null, num: true },
    { label: 'État', value: card.condition_notes || 'Mint / Near Mint' },
  ];

  const textFields = (keys: [
    'player' | 'team' | 'year' | 'brand' | 'set_name' | 'insert_name' | 'parallel_name' | 'card_number' | 'numbered' | 'purchase_price' | 'vinted_price' | 'vinted_url' | 'ebay_url',
    string,
    string?,
  ][]) =>
    keys.map(([key, label, span]) => (
      <Field key={key} label={label} className={span}>
        <input
          className="ui-input"
          inputMode={key.endsWith('_price') ? 'decimal' : undefined}
          value={fields[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      </Field>
    ));

  const photoStage = (
    <div className="flex flex-col items-center gap-3">
      <div
        {...dropProps(side)}
        role={shownUrl ? 'button' : undefined}
        tabIndex={shownUrl ? 0 : undefined}
        aria-label={shownUrl ? (editing ? `Remplacer la photo (${SIDE_LABEL[side].toLowerCase()})` : 'Afficher en plein écran') : undefined}
        onClick={() => handleImageClick(side)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleImageClick(side); } }}
        className={`group relative aspect-[5/7] w-full max-w-[min(18rem,calc((94dvh_-_18rem)*0.714))] overflow-hidden rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] md:max-w-[min(100%,calc((92dvh_-_16rem)*0.714))] ${
          dragOver === side ? 'border-[var(--accent)] bg-[var(--accent-dim)]' : 'border-[var(--border)] bg-[var(--bg-secondary)]'
        } ${shownUrl ? (editing ? 'cursor-pointer' : 'cursor-zoom-in') : ''}`}
      >
        {shownUrl ? (
          <img
            key={side}
            src={cdnImg(shownUrl)}
            alt={`${card.player ?? 'Carte'} (${SIDE_LABEL[side].toLowerCase()})`}
            decoding="async"
            draggable={false}
            className={`h-full w-full object-contain transition-opacity ${editing ? 'opacity-80' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-[var(--text-muted)]">
            <ImageIcon size={28} strokeWidth={1.5} />
            <span className="text-[13px]">Pas de photo du {side === 'front' ? 'recto' : 'verso'}</span>
            {editing && <span className="text-xs">Glisse une image ici ou utilise « Ajouter »</span>}
          </div>
        )}

        {!editing && shownUrl && (
          <span className="pointer-events-none absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-lg dark-scope bg-black/70 text-[var(--text-primary)] ring-1 ring-white/10 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <Maximize2 size={14} />
          </span>
        )}
        {editing && shownUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 dark-scope bg-black/55 text-[13px] font-medium text-[var(--text-primary)] opacity-0 transition-opacity group-hover:opacity-100">
            <Camera size={18} />
            Remplacer la photo
          </div>
        )}
        {uploadingImage === side && (
          <div className="absolute inset-0 flex items-center justify-center dark-scope bg-black/60">
            <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
          </div>
        )}
      </div>

      <div className="flex w-full max-w-[min(18rem,calc((94dvh_-_18rem)*0.714))] items-center gap-2 md:max-w-none">
        {SIDES.map((s) => {
          const url = urlOf(s);
          const isActive = side === s;
          return (
            <button
              key={s}
              type="button"
              {...dropProps(s)}
              onClick={() => setSide(s)}
              disabled={!url && !editing}
              aria-pressed={isActive}
              className={`flex items-center gap-2 rounded-lg border p-1 pr-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                dragOver === s
                  ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                  : isActive
                    ? 'border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="relative flex h-10 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--bg-secondary)]">
                {url ? (
                  <img src={cdnImg(url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon size={12} className="text-[var(--text-muted)]" />
                )}
                {uploadingImage === s && (
                  <span className="absolute inset-0 flex items-center justify-center dark-scope bg-black/60">
                    <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
                  </span>
                )}
              </span>
              {SIDE_LABEL[s]}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <button
              type="button"
              onClick={() => inputRefOf(side).current?.click()}
              disabled={uploadingImage != null}
              className="ui-btn"
            >
              <ImagePlus size={15} />
              {shownUrl ? 'Remplacer' : 'Ajouter'}
            </button>
          ) : (
            <>
              {hasAnyPhoto && (
                <button
                  onClick={handleDownloadPhotos}
                  disabled={downloadingPhotos}
                  title="Télécharger les photos"
                  aria-label="Télécharger les photos"
                  className="ui-btn ui-btn-icon"
                >
                  {downloadingPhotos ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                </button>
              )}
              {shownUrl && (
                <button
                  onClick={() => setLightboxSide(side)}
                  title="Plein écran"
                  aria-label="Afficher en plein écran"
                  className="ui-btn ui-btn-icon"
                >
                  <Maximize2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <input ref={frontInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'front'); e.target.value = ''; }} />
      <input ref={backInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'back'); e.target.value = ''; }} />
    </div>
  );

  const viewContent = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={card.status} />
        {card.is_rookie && <RookieBadge compact />}
        {card.grading_company && <GradingBadge card={card} />}
        {card.numbered && (
          <Badge tone="accent" className="tabular">
            <Hash size={11} />
            {card.numbered}
          </Badge>
        )}
        {card.card_type && !(card.card_type === 'numbered' && card.numbered) && <CardBadge type={card.card_type} />}
      </div>

      <section>
        <SectionTitle>Prix & vente</SectionTitle>
        {ebayError && (
          <div className="mb-2">
            <Notice tone="error" icon={AlertCircle}>{ebayError}</Notice>
          </div>
        )}
        <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          <MarketRow logo={<VintedLogo width={50} height={14} />} label="Vinted" price={vintedPrice} live={!!card.vinted_url}>
            {card.vinted_url ? (
              <a href={card.vinted_url} target="_blank" rel="noopener noreferrer" className="ui-btn">
                Voir <ExternalLink size={13} />
              </a>
            ) : (
              <button onClick={publishToVinted} className="ui-btn text-[var(--accent)]">
                Publier
              </button>
            )}
          </MarketRow>
          <MarketRow logo={<EbayLogo width={36} height={14} />} label="eBay" price={card.ebay_price} live={!!card.ebay_offer_id}>
            {card.ebay_offer_id ? (
              <>
                <button onClick={withdrawFromEbay} disabled={withdrawingEbay} className="ui-btn ui-btn-danger">
                  {withdrawingEbay ? <Loader2 size={14} className="animate-spin" /> : null}
                  {withdrawingEbay ? 'Retrait…' : 'Retirer'}
                </button>
                <a href={card.ebay_url ?? '#'} target="_blank" rel="noopener noreferrer" className="ui-btn">
                  Voir <ExternalLink size={13} />
                </a>
              </>
            ) : (
              <button onClick={() => setShowEbayPublish(true)} className="ui-btn text-[var(--accent)]">
                Publier
              </button>
            )}
          </MarketRow>
          {card.purchase_price != null && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
              <span className="text-[var(--text-muted)]">Prix d’achat</span>
              <span className="tabular font-medium text-[var(--text-secondary)]">{formatEuro(card.purchase_price)}</span>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle>Détails</SectionTitle>
        <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {details
            .filter((item) => item.value)
            .map((item) => (
              <div key={item.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-3 py-2 text-[13px]">
                <dt className="text-[var(--text-muted)]">{item.label}</dt>
                <dd className={`break-words font-medium text-[var(--text-primary)] ${item.num ? 'tabular' : ''}`}>{item.value}</dd>
              </div>
            ))}
        </dl>
      </section>

      {card.grading_company && (
        <section>
          <SectionTitle>Gradation {card.grading_company}</SectionTitle>
          <div className="rounded-xl border border-[var(--border)] px-3 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-[var(--text-muted)]">Note</div>
                <div className="tabular text-2xl font-semibold tracking-tight text-[var(--accent)]">{card.grading_grade || 'En attente'}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)]">Statut</div>
                <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                  {card.grading_status ? GRADING_STATUS_LABELS[card.grading_status] : '—'}
                </div>
              </div>
            </div>
            {(card.grading_cert || card.grading_cost != null || card.grading_submitted_at || card.grading_returned_at) && (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--border)] pt-3 text-[13px]">
                {card.grading_cert && (
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Certificat</dt>
                    <dd className="tabular break-all text-[var(--text-primary)]">{card.grading_cert}</dd>
                  </div>
                )}
                {card.grading_cost != null && (
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Coût</dt>
                    <dd className="tabular text-[var(--text-primary)]">{formatEuro(card.grading_cost)}</dd>
                  </div>
                )}
                {card.grading_submitted_at && (
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Envoyée le</dt>
                    <dd className="tabular text-[var(--text-primary)]">{formatDay(card.grading_submitted_at)}</dd>
                  </div>
                )}
                {card.grading_returned_at && (
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Reçue le</dt>
                    <dd className="tabular text-[var(--text-primary)]">{formatDay(card.grading_returned_at)}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          action={
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(buildPriceSearchText(card));
                  window.open(`https://130point.com/sales/?q=${encodeURIComponent(buildPriceSearchText(card))}`, '_blank');
                }}
                className="ui-btn ui-btn-ghost ui-btn-sm"
              >
                130 Point <ExternalLink size={12} />
              </button>
              <button onClick={openEbaySold} className="ui-btn ui-btn-ghost ui-btn-sm">
                eBay Sold <ExternalLink size={12} />
              </button>
            </div>
          }
        >
          Marché
        </SectionTitle>
        <EbaySoldItems
          query={buildPriceSearchText(card)}
          imageUrl={card.image_front_url}
          match={{
            year: card.year,
            cardNumber: card.card_number,
            numbered: card.numbered,
            setName: card.set_name || card.brand,
          }}
          cardId={card.id}
          currentPrice={card.price}
          onApplyPrice={(eur) =>
            updateCard.mutateAsync({
              id: card.id,
              price: eur,
              status: card.status === 'draft' || card.status === 'collection' ? 'a_vendre' : card.status,
            })
          }
        />
      </section>
    </div>
  );

  const editContent = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5">
        <p className="text-xs text-[var(--text-muted)]">Pré-remplit les champs à partir de la photo du recto.</p>
        <button onClick={handleReanalyze} disabled={identify.isPending || !card.image_front_url} className="ui-btn ui-btn-sm">
          {identify.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {identify.isPending ? 'Analyse en cours…' : 'Ré-analyser avec l’IA'}
        </button>
      </div>
      {reanalyzeError && <Notice tone="error" icon={AlertCircle}>{reanalyzeError}</Notice>}

      <section>
        <SectionTitle>Identification</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {textFields([['player', 'Joueur', 'col-span-2'], ['team', 'Équipe']])}
          <Field label="Sport">
            <select className="ui-select" value={fields.sport} onChange={(e) => set('sport', e.target.value as Sport)}>
              {SPORTS.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
            </select>
          </Field>
          {textFields([
            ['year', 'Année'],
            ['brand', 'Marque'],
            ['set_name', 'Set'],
            ['insert_name', 'Insert'],
            ['parallel_name', 'Parallel'],
            ['card_number', 'N° carte'],
            ['numbered', 'Tirage'],
          ])}
          <Field label="Type">
            <select className="ui-select" value={fields.card_type} onChange={(e) => set('card_type', e.target.value)}>
              <option value="">—</option>
              {CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Notes d'état" className="col-span-2">
            <input className="ui-input" value={fields.condition_notes} onChange={(e) => set('condition_notes', e.target.value)} />
          </Field>
        </div>
      </section>

      <section>
        <SectionTitle>Prix & vente</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Statut" className="col-span-2">
            <select className="ui-select" value={fields.status} onChange={(e) => set('status', e.target.value)}>
              <option value="collection">Collection</option>
              <option value="a_vendre">À vendre</option>
              <option value="reserve">Réservé</option>
              <option value="vendu">Vendu</option>
            </select>
          </Field>
          {textFields([['purchase_price', 'Prix achat (€)']])}
          <Field label="Quantité">
            <input type="number" min={1} className="ui-input tabular" value={fields.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="1" />
          </Field>
          {textFields([['vinted_price', 'Prix Vinted (€)']])}
          <Field label="Prix eBay (€)" hint="Cible : 9 % de frais eBay + 0,35 €">
            <div className="flex gap-1.5">
              <input
                className="ui-input min-w-0"
                inputMode="decimal"
                value={fields.ebay_price}
                onChange={(e) => set('ebay_price', e.target.value)}
              />
              <button
                type="button"
                onClick={recalculateEbayPrice}
                title="Recalculer depuis le prix Vinted"
                aria-label="Recalculer le prix eBay depuis le prix Vinted"
                className="ui-btn ui-btn-icon shrink-0"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </Field>
          {textFields([['vinted_url', 'Lien Vinted', 'col-span-2'], ['ebay_url', 'Lien eBay', 'col-span-2']])}
        </div>
      </section>

      {folders.length > 0 && (
        <section>
          <SectionTitle>Dossiers</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {folders.map((f) => {
              const active = folderIds.includes(f.id);
              return (
                <button
                  type="button"
                  key={f.id}
                  onClick={() => setFolderIds((prev) => (active ? prev.filter((id) => id !== f.id) : [...prev, f.id]))}
                  data-active={active}
                  className="ui-chip"
                >
                  {f.emoji && <span>{f.emoji}</span>}
                  {f.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          action={
            <button onClick={() => setShowGrading((v) => !v)} className="ui-btn ui-btn-ghost ui-btn-sm">
              {showGrading ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showGrading ? 'Moins d’options' : 'Plus d’options'}
            </button>
          }
        >
          Gradation
        </SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Société">
            <select className="ui-select" value={fields.grading_company} onChange={(e) => set('grading_company', e.target.value)}>
              <option value="">—</option>
              {GRADING_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Statut">
            <select className="ui-select" value={fields.grading_status} onChange={(e) => set('grading_status', e.target.value)}>
              {(Object.entries(GRADING_STATUS_LABELS) as [GradingStatus, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <input className="ui-input" value={fields.grading_grade} onChange={(e) => set('grading_grade', e.target.value)} placeholder="10 / 9 / 8.5" />
          </Field>
        </div>
        {showGrading && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-3">
            <Field label="Certificat #">
              <input className="ui-input tabular" value={fields.grading_cert} onChange={(e) => set('grading_cert', e.target.value)} placeholder="00000000" />
            </Field>
            <Field label="Coût grading (€)">
              <input type="number" className="ui-input tabular" value={fields.grading_cost} onChange={(e) => set('grading_cost', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Envoyé le">
              <input type="date" className="ui-input" value={fields.grading_submitted_at} onChange={(e) => set('grading_submitted_at', e.target.value)} />
            </Field>
            <Field label="Reçu le">
              <input type="date" className="ui-input" value={fields.grading_returned_at} onChange={(e) => set('grading_returned_at', e.target.value)} />
            </Field>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <>
      {createPortal(
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-[var(--backdrop)] backdrop-blur-[2px]" onClick={saving ? undefined : onClose} />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-detail-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 34, stiffness: 420 }}
            className="relative flex h-[94dvh] max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] outline-none sm:h-auto sm:max-h-[92dvh] sm:max-w-5xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 id="card-detail-title" className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
                  {card.player ?? 'Carte inconnue'}
                </h2>
                <p className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">
                  {editing ? 'Modification de la carte' : subtitle || '—'}
                </p>
              </div>
              <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon -mr-2 -mt-1 h-8 w-8" aria-label="Fermer">
                <X size={16} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-6">
                <div className="md:sticky md:top-5 md:self-start">{photoStage}</div>
                <div className="min-w-0 space-y-4">
                  {ebaySyncNotice && (
                    <Notice tone="error" icon={AlertCircle}>
                      <div className="flex items-start gap-2">
                        <span className="flex-1">{ebaySyncNotice}</span>
                        <button onClick={() => setEbaySyncNotice(null)} aria-label="Masquer" className="shrink-0 opacity-70 hover:opacity-100">
                          <X size={14} />
                        </button>
                      </div>
                    </Notice>
                  )}
                  {editing ? editContent : viewContent}
                </div>
              </div>
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-3">
              {editing ? (
                <>
                  <button onClick={() => setEditing((v) => !v)} disabled={saving} className="ui-btn">
                    Annuler
                  </button>
                  <button onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary">
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleDelete} disabled={deleteCard.isPending} className="ui-btn ui-btn-danger mr-auto">
                    <Trash2 size={15} />
                    Supprimer
                  </button>
                  <button onClick={() => setEditing((v) => !v)} className="ui-btn ui-btn-primary">
                    <Pencil size={15} />
                    Modifier
                  </button>
                </>
              )}
            </footer>
          </motion.div>
        </motion.div>,
        document.body,
      )}

      {lightboxSide && (
        <Lightbox
          card={card}
          side={lightboxSide}
          onSide={(s) => { setLightboxSide(s); setSide(s); }}
          onClose={() => setLightboxSide(null)}
        />
      )}

      {showEbayPublish &&
        createPortal(
          <EbayPublishModal
            card={card}
            onClose={() => setShowEbayPublish(false)}
            onPublished={() => { setShowEbayPublish(false); queryClient.invalidateQueries({ queryKey: ['cards'] }); }}
          />,
          document.body,
        )}

      {vintedPreview && (
        <Modal
          onClose={() => setVintedPreview(null)}
          title="Aperçu de la photo Vinted"
          subtitle={formatVintedNumberedBadge(card.numbered)}
          size="sm"
          zIndex={110}
          footer={
            <>
              <button onClick={() => setVintedPreview(null)} className="ui-btn">
                Annuler
              </button>
              <button
                onClick={() => { openVintedDraft(vintedPreview.payload); setVintedPreview(null); }}
                className="ui-btn ui-btn-primary"
              >
                Continuer vers Vinted
              </button>
            </>
          }
        >
          <img src={vintedPreview.image} alt="Aperçu du badge de tirage" className="mx-auto max-h-[60vh] rounded-xl object-contain" />
        </Modal>
      )}
    </>
  );
}
