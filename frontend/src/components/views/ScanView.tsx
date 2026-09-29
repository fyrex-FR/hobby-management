import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CameraOff, Check, ImageUp, Library, Loader2, Plus, RotateCcw, ScanLine, Sparkles, TrendingUp, X } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useCards, useCreateCard, useUpdateCard } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import { computeStats, filterRelevant, toEurPrice, trimOutliers, withoutGraded, type EbayData, type EbayResult } from '../../lib/ebayComps';
import { holoRarity } from '../../lib/holo';
import { playerLastName, playerNameKey } from '../../lib/playerName';
import { formatCardNumber } from '../../lib/cardQuality';
import { errorMessage, toast } from '../../lib/feedback';
import type { AIIdentificationResult, Card } from '../../types';
import { CardDetail } from '../shared/CardDetail';
import { HoloCard } from '../ui';

/**
 * Scan live : on vise une carte, l'IA l'identifie sur la seule photo du recto,
 * les ventes eBay comparables donnent une valeur estimée, et on l'ajoute à la
 * collection en un geste. Déclenché au toucher (pas en continu) pour ne pas
 * consommer le quota d'identification.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
/** Cadre de visée au format carte (63 × 88 mm). */
const CARD_RATIO = 63 / 88;

type Phase = 'live' | 'analyzing' | 'result';

interface Estimate {
  status: 'loading' | 'ready' | 'none' | 'error';
  source?: 'sold' | 'active';
  /** Obtenue avec la recherche élargie (joueur + set) : moins précise. */
  broad?: boolean;
  value?: number;
  min?: number;
  max?: number;
  count?: number;
  thumbs?: string[];
}

interface ScanResult {
  id: string;
  imageUrl: string;
  blob: Blob;
  /** Verso : le tirage (/99), le numéro et souvent la saison y sont imprimés. */
  backUrl?: string;
  backBlob?: Blob;
  ident: AIIdentificationResult;
  estimate: Estimate;
  addedCardId?: string;
}

function buildQuery(r: AIIdentificationResult): string {
  return [r.player, r.year, r.set || r.brand, formatCardNumber(r.card_number), r.insert, r.parallel, r.numbered]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(',')[1] ?? '';
}

/** Recadre la vidéo sur le cadre de visée affiché (object-cover) et encode en JPEG. */
function captureFrame(video: HTMLVideoElement, frame: HTMLElement): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const vr = video.getBoundingClientRect();
  const fr = frame.getBoundingClientRect();
  const scale = Math.max(vr.width / vw, vr.height / vh); // object-cover
  const offsetX = (vw * scale - vr.width) / 2;
  const offsetY = (vh * scale - vr.height) / 2;
  // Petite marge autour du cadre : l'IA lit mieux les bords (logo, numéro).
  const pad = 0.06;
  let sx = (fr.left - vr.left + offsetX) / scale - (fr.width / scale) * pad;
  let sy = (fr.top - vr.top + offsetY) / scale - (fr.height / scale) * pad;
  let sw = (fr.width / scale) * (1 + pad * 2);
  let sh = (fr.height / scale) * (1 + pad * 2);
  sx = Math.max(0, sx); sy = Math.max(0, sy);
  sw = Math.min(vw - sx, sw); sh = Math.min(vh - sy, sh);

  const maxEdge = 1400;
  const k = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * k);
  canvas.height = Math.round(sh * k);
  canvas.getContext('2d')!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture impossible'))), 'image/jpeg', 0.88),
  );
}

/** Photo importée : réduite à 1400 px pour un envoi rapide. */
async function downscaleFile(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible'))), 'image/jpeg', 0.88),
  );
}

/** Ventes (ou annonces) vraiment comparables : bon joueur, bonne carte, brute, sans prix aberrant. */
function comparable(results: EbayResult[], ident: AIIdentificationResult): EbayResult[] {
  let pool = results;
  const last = playerLastName(ident.player).toLowerCase();
  if (last) {
    const byPlayer = pool.filter((r) => r.title.toLowerCase().includes(last));
    if (byPlayer.length >= 2) pool = byPlayer;
  }
  const relevant = filterRelevant(pool, { year: ident.year, cardNumber: ident.card_number, numbered: ident.numbered, setName: ident.set });
  if (relevant.length >= 2) pool = relevant;
  // La carte scannée est brute : les slabs gradés faussent l'estimation.
  const raw = withoutGraded(pool);
  if (raw.length >= 2) pool = raw;
  return trimOutliers(pool);
}

/** Requête large : joueur + set + insert, sans année ni parallel (souvent mal lus sur photo). */
function broadQuery(r: AIIdentificationResult): string {
  return [r.player, r.set || r.brand, r.insert].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchEstimate(ident: AIIdentificationResult): Promise<Estimate> {
  const precise = await estimateFor(buildQuery(ident), ident);
  if (precise.status === 'ready') return precise;
  const broad = broadQuery(ident);
  if (!broad || broad === buildQuery(ident)) return precise;
  // Sans année ni parallel, on filtre seulement sur le joueur et la carte brute.
  const loose = { ...ident, year: '', numbered: '', card_number: '' };
  const wide = await estimateFor(broad, loose);
  return wide.status === 'ready' ? { ...wide, broad: true } : precise;
}

async function estimateFor(query: string, ident: AIIdentificationResult): Promise<Estimate> {
  const body = JSON.stringify({ query });
  // Ventes réelles d'abord ; si eBay bloque la recherche des ventes (anti-bot),
  // on retombe sur les annonces en cours, via l'API officielle.
  const [sold, active] = await Promise.allSettled([
    apiFetch<EbayData>('/ebay/sold-items', { method: 'POST', body }, 45000),
    apiFetch<EbayData>('/ebay/active-items', { method: 'POST', body }, 30000),
  ]);
  const pick = (res: PromiseSettledResult<EbayData>, source: 'sold' | 'active'): Estimate | null => {
    if (res.status !== 'fulfilled') return null;
    const pool = comparable(res.value.results ?? [], ident);
    const stats = computeStats(pool);
    if (!stats || stats.count < 2) return null;
    return {
      status: 'ready',
      source,
      value: toEurPrice(stats.median),
      min: toEurPrice(stats.min),
      max: toEurPrice(stats.max),
      count: stats.count,
      thumbs: pool.map((r) => r.image).filter(Boolean).slice(0, 4),
    };
  };
  const estimate = pick(sold, 'sold') ?? pick(active, 'active');
  if (estimate) return estimate;
  const blocked = sold.status === 'fulfilled' && !!sold.value.error && !(sold.value.results ?? []).length;
  return { status: blocked && active.status === 'rejected' ? 'error' : 'none' };
}

export function ScanView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'denied' | 'unavailable'>('starting');
  const [phase, setPhase] = useState<Phase>('live');
  const [frozen, setFrozen] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [current, setCurrent] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [adding, setAdding] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  // Recto + verso par défaut : sur les cartes de sport, le tirage et le numéro
  // sont au dos. Choix mémorisé (le mode « recto seul » est plus rapide).
  const [withBack, setWithBackState] = useState(() => {
    try { return localStorage.getItem('cv-scan-back') !== '0'; } catch { return true; }
  });
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [pendingFront, setPendingFront] = useState<{ blob: Blob; url: string } | null>(null);
  /** Résultat auquel on ajoute un verso après coup (« Ajouter le verso »). */
  const [refineOf, setRefineOf] = useState<ScanResult | null>(null);
  const [shownBack, setShownBack] = useState(false);

  function setWithBack(v: boolean) {
    setWithBackState(v);
    try { localStorage.setItem('cv-scan-back', v ? '1' : '0'); } catch { /* stockage indisponible */ }
  }
  const { data: cards = [] } = useCards();
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const setActiveView = useAppStore((s) => s.setActiveView);

  // Caméra arrière, relancée si on revient sur l'onglet.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setCamera('unavailable'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamera('on');
      } catch (e) {
        setCamera((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    }
    void start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const ownedMatches = useCallback(
    (r: AIIdentificationResult): Card[] => {
      if (!r.player) return [];
      const key = playerNameKey(r.player);
      const year = parseInt(r.year?.match(/\d{4}/)?.[0] ?? '', 10);
      const cardYear = (c: Card) => parseInt(c.year?.match(/\d{4}/)?.[0] ?? '', 10);
      return cards.filter((c) =>
        c.status !== 'draft' &&
        playerNameKey(c.player) === key &&
        // La saison lue sur photo est souvent décalée d'un an (2011-12 / 2012-13).
        (Number.isNaN(year) || Number.isNaN(cardYear(c)) || Math.abs(cardYear(c) - year) <= 1) &&
        (!r.set || !c.set_name || c.set_name.toLowerCase() === r.set.toLowerCase()),
      );
    },
    [cards],
  );

  async function analyze(front: Blob, back?: Blob, opts: { frontUrl?: string; replaceId?: string } = {}) {
    const imageUrl = opts.frontUrl ?? URL.createObjectURL(front);
    const backUrl = back ? URL.createObjectURL(back) : undefined;
    setFrozen(backUrl ?? imageUrl);
    setPhase('analyzing');
    try {
      const [front_base64, back_base64] = await Promise.all([blobToBase64(front), back ? blobToBase64(back) : Promise.resolve(undefined)]);
      const ident = await apiFetch<AIIdentificationResult>('/identify', {
        method: 'POST',
        body: JSON.stringify({ front_base64, ...(back_base64 ? { back_base64 } : {}) }),
      }, 60000);
      const result: ScanResult = {
        id: opts.replaceId ?? crypto.randomUUID(),
        imageUrl, blob: front, backUrl, backBlob: back, ident, estimate: { status: 'loading' },
      };
      setCurrent(result);
      setShownBack(false);
      setPhase('result');
      navigator.vibrate?.(18);
      // Le nom s'affiche tout de suite ; la valeur arrive quand eBay répond.
      fetchEstimate(ident)
        .catch(() => ({ status: 'error' }) as Estimate)
        .then((estimate) => {
          setCurrent((c) => (c?.id === result.id ? { ...c, estimate } : c));
          setHistory((h) => {
            const done = { ...result, estimate };
            return opts.replaceId ? h.map((x) => (x.id === opts.replaceId ? done : x)) : [done, ...h].slice(0, 12);
          });
        });
    } catch (e) {
      toast.error('Carte non reconnue', { description: errorMessage(e, 'Réessaie avec la carte bien à plat dans le cadre, sans reflet.') });
      setFrozen(null);
      setPhase('live');
    }
  }

  /** Une photo vient d'être prise (caméra ou import) pour le côté en cours. */
  async function onCaptured(blob: Blob) {
    if (refineOf) {
      const target = refineOf;
      setRefineOf(null);
      setSide('front');
      await analyze(target.blob, blob, { frontUrl: target.imageUrl, replaceId: target.id });
      return;
    }
    if (side === 'front' && withBack) {
      setPendingFront({ blob, url: URL.createObjectURL(blob) });
      setSide('back');
      navigator.vibrate?.([10, 60, 10]);
      return;
    }
    if (side === 'back' && pendingFront) {
      const front = pendingFront;
      setPendingFront(null);
      setSide('front');
      await analyze(front.blob, blob, { frontUrl: front.url });
      return;
    }
    await analyze(blob);
  }

  /** Verso ignoré : on analyse le recto seul. */
  async function skipBack() {
    if (refineOf) { setRefineOf(null); setSide('front'); setFrozen(current?.imageUrl ?? null); setPhase('result'); return; }
    if (!pendingFront) return;
    const front = pendingFront;
    setPendingFront(null);
    setSide('front');
    await analyze(front.blob, undefined, { frontUrl: front.url });
  }

  /** Depuis le résultat : reprendre le verso pour préciser tirage et numéro. */
  function addBack() {
    if (!current) return;
    setRefineOf(current);
    setSide('back');
    setFrozen(null);
    setPhase('live');
  }

  async function shoot() {
    if (phase !== 'live') return;
    const video = videoRef.current;
    const frame = frameRef.current;
    if (camera !== 'on' || !video || !frame || !video.videoWidth) { fileRef.current?.click(); return; }
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
    navigator.vibrate?.(10);
    try {
      await onCaptured(await captureFrame(video, frame));
    } catch (e) {
      toast.error('Capture impossible', { description: errorMessage(e) });
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      await onCaptured(await downscaleFile(file));
    } catch (e) {
      toast.error('Image illisible', { description: errorMessage(e) });
    }
  }

  function again() {
    setCurrent(null);
    setFrozen(null);
    setPendingFront(null);
    setRefineOf(null);
    setSide('front');
    setPhase('live');
  }

  async function addToCollection() {
    if (!current || adding) return;
    const r = current.ident;
    setAdding(true);
    try {
      const card = await createCard.mutateAsync({
        sport: r.sport,
        player: r.player || null,
        team: r.team || null,
        year: r.year || null,
        brand: r.brand || null,
        set_name: r.set || null,
        insert_name: r.insert || null,
        parallel_name: r.parallel || null,
        parallel_confidence: r.parallel_confidence ?? null,
        card_number: r.card_number || null,
        numbered: r.numbered || null,
        is_rookie: r.is_rookie,
        card_type: r.card_type || null,
        condition_notes: r.condition_notes || null,
        status: 'collection',
      });
      const { data } = await supabase.auth.getSession();
      const upload = async (blob: Blob, which: 'front' | 'back'): Promise<string | null> => {
        const form = new FormData();
        form.append('file', new File([blob], `${which}.jpg`, { type: 'image/jpeg' }));
        form.append('card_id', card.id);
        form.append('side', which);
        const resp = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
          body: form,
        });
        return resp.ok ? (await resp.json()).url : null;
      };
      const [frontUrl, backUrl] = await Promise.all([
        upload(current.blob, 'front'),
        current.backBlob ? upload(current.backBlob, 'back') : Promise.resolve(null),
      ]);
      const images = { ...(frontUrl ? { image_front_url: frontUrl } : {}), ...(backUrl ? { image_back_url: backUrl } : {}) };
      if (Object.keys(images).length) await updateCard.mutateAsync({ id: card.id, ...images });
      if (!frontUrl || (current.backBlob && !backUrl)) {
        toast.error('Photo non enregistrée', { description: 'L’envoi d’une photo a échoué, tu pourras l’ajouter depuis la fiche.' });
      }
      const added = { ...current, addedCardId: card.id };
      setCurrent(added);
      setHistory((h) => h.map((x) => (x.id === added.id ? added : x)));
      toast.success(`${r.player || 'Carte'} ajoutée à ta collection`, {
        action: { label: 'Ouvrir', onClick: () => setOpenCardId(card.id) },
      });
    } catch (e) {
      toast.error('Ajout impossible', { description: errorMessage(e) });
    } finally {
      setAdding(false);
    }
  }

  // Espace / Entrée déclenchent le scan (démo au clavier sur ordinateur).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (phase === 'live') { e.preventDefault(); void shoot(); }
        else if (phase === 'result') { e.preventDefault(); again(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const owned = useMemo(() => (current ? ownedMatches(current.ident) : []), [current, ownedMatches]);
  const openCard = openCardId ? cards.find((c) => c.id === openCardId) : undefined;
  const sessionTotal = history.reduce((s, h) => s + (h.estimate.value ?? 0), 0);

  return (
    <div className="dark-scope relative flex h-full flex-col overflow-hidden bg-black text-[var(--text-primary)]">
      {/* Caméra plein cadre */}
      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${camera === 'on' && !frozen ? 'opacity-100' : 'opacity-0'}`}
        />
        {frozen && <img src={frozen} alt="" className="absolute inset-0 h-full w-full object-contain opacity-40 blur-sm" />}

        {/* Voile autour du cadre */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 pb-40 sm:pb-36">
          <div
            ref={frameRef}
            className="relative h-full max-h-[520px] shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]"
            style={{ aspectRatio: CARD_RATIO, borderRadius: 18 }}
          >
            {phase === 'analyzing' && frozen && (
              <img src={frozen} alt="" className="absolute inset-0 h-full w-full rounded-[18px] object-cover" />
            )}
            <AnimatePresence>
              {phase === 'live' && side === 'back' && (
                <motion.div
                  key="flip"
                  className="absolute inset-0 flex items-center justify-center rounded-[18px] border-2 border-[var(--violet)] bg-[color-mix(in_srgb,var(--violet)_18%,transparent)]"
                  initial={{ rotateY: 0, opacity: 0.9 }}
                  animate={{ rotateY: 180, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: 'easeInOut' }}
                  style={{ transformPerspective: 800 }}
                >
                  <RotateCcw size={34} className="text-white" />
                </motion.div>
              )}
            </AnimatePresence>
            {phase === 'live' && withBack && (
              <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                {side === 'front' ? 'Recto · 1/2' : 'Verso · 2/2'}
              </span>
            )}
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <span
                key={c}
                className={`scan-corner scan-corner-${c} ${phase === 'analyzing' ? 'scan-corner-busy' : ''}`}
              />
            ))}
            {phase === 'analyzing' && (
              <>
                <span className="scan-line" />
                <span className="absolute inset-x-0 -bottom-12 flex items-center justify-center gap-2 text-[13px] font-medium text-white">
                  <Sparkles size={15} className="animate-pulse text-[var(--violet)]" /> Identification en cours…
                </span>
              </>
            )}
          </div>
        </div>

        {/* États caméra */}
        {camera !== 'on' && phase === 'live' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 pb-40 text-center">
            {camera === 'starting' ? (
              <Loader2 size={26} className="animate-spin text-[var(--text-muted)]" />
            ) : (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10"><CameraOff size={22} /></span>
                <div>
                  <p className="text-sm font-medium">{camera === 'denied' ? 'Accès à la caméra refusé' : 'Pas de caméra disponible'}</p>
                  <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                    {camera === 'denied' ? 'Autorise la caméra dans les réglages du navigateur, ou importe une photo.' : 'Importe une photo du recto de ta carte.'}
                  </p>
                </div>
                <button className="ui-btn ui-btn-primary pointer-events-auto" onClick={() => fileRef.current?.click()}>
                  <ImageUp size={15} /> Importer une photo
                </button>
              </>
            )}
          </div>
        )}

        {/* Flash de capture */}
        <AnimatePresence>
          {flash && <motion.div className="absolute inset-0 bg-white" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />}
        </AnimatePresence>

        {/* En-tête flottant */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4">
          <div className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium backdrop-blur">
            <ScanLine size={13} className="-mt-0.5 mr-1.5 inline text-[var(--violet)]" />
            Scan live
          </div>
          {history.length > 0 && (
            <div className="rounded-full bg-black/50 px-3 py-1.5 text-xs backdrop-blur">
              <span className="tabular font-semibold">{history.length}</span> scannée{history.length > 1 ? 's' : ''}
              {sessionTotal > 0 && <> · <span className="tabular font-semibold">{euro.format(sessionTotal)}</span></>}
            </div>
          )}
        </div>
      </div>

      {/* Déclencheur + historique */}
      {phase !== 'result' && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pb-6 pt-10">
          <p className="text-center text-[13px] text-[var(--text-secondary)]">
            {phase === 'analyzing'
              ? (side === 'back' || current?.backUrl ? 'Lecture des deux faces…' : 'Ne bouge plus…')
              : side === 'back'
                ? <>Retourne la carte : <span className="text-white">tirage et numéro sont souvent au dos</span></>
                : 'Place la carte dans le cadre, puis touche le bouton'}
          </p>
          {phase === 'live' && side === 'front' && !refineOf && (
            <div className="ui-segmented" role="radiogroup" aria-label="Faces à scanner">
              <button role="radio" aria-checked={withBack} data-active={withBack} onClick={() => setWithBack(true)}>Recto + verso</button>
              <button role="radio" aria-checked={!withBack} data-active={!withBack} onClick={() => setWithBack(false)}>Recto seul</button>
            </div>
          )}
          {phase === 'live' && side === 'back' && (
            <button className="text-[13px] font-medium text-[var(--text-secondary)] underline-offset-4 hover:text-white hover:underline" onClick={() => void skipBack()}>
              {refineOf ? 'Annuler' : 'Passer le verso'}
            </button>
          )}
          <div className="flex items-center gap-8">
            <button className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20" onClick={() => fileRef.current?.click()} aria-label="Importer une photo" title="Importer une photo">
              <ImageUp size={18} />
            </button>
            <button
              onClick={() => void shoot()}
              disabled={phase !== 'live'}
              aria-label="Scanner la carte"
              className="group relative flex h-[76px] w-[76px] items-center justify-center rounded-full border-[3px] border-white/90 transition-transform active:scale-95 disabled:opacity-60"
            >
              <span className="h-[60px] w-[60px] rounded-full bg-white transition-transform group-hover:scale-95" />
              {phase === 'analyzing' && <Loader2 size={24} className="absolute animate-spin text-black" />}
            </button>
            <div className="h-11 w-11">
              {side === 'back' && (pendingFront || refineOf) ? (
                <div className="relative h-11 w-11 overflow-hidden rounded-lg ring-2 ring-[var(--violet)]" title="Recto déjà pris">
                  <img src={pendingFront?.url ?? refineOf?.imageUrl} alt="Recto" className="h-full w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[9px] font-semibold">RECTO</span>
                </div>
              ) : history[0] && (
                <button onClick={() => { setCurrent(history[0]); setFrozen(history[0].imageUrl); setPhase('result'); }} className="h-11 w-11 overflow-hidden rounded-lg ring-2 ring-white/70" aria-label="Dernier scan">
                  <img src={history[0].imageUrl} alt="" className="h-full w-full object-cover" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Résultat */}
      <AnimatePresence>
        {phase === 'result' && current && (
          <motion.div
            key={current.id}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="absolute inset-x-0 bottom-0 max-h-[88%] overflow-y-auto rounded-t-3xl border-t border-[var(--border-strong)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)]"
          >
            <div className="mx-auto max-w-3xl p-5 sm:p-6">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--border-strong)] sm:hidden" />
              <div className="flex gap-5">
                <div className="w-28 shrink-0 sm:w-40">
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => current.backUrl && setShownBack((v) => !v)}
                    aria-label={current.backUrl ? (shownBack ? 'Voir le recto' : 'Voir le verso') : undefined}
                  >
                    <HoloCard rarity={holoRarity({ card_type: current.ident.card_type, grading_company: null, numbered: current.ident.numbered, parallel_name: current.ident.parallel, is_rookie: current.ident.is_rookie })} maxTilt={14} gyro>
                      <img src={shownBack && current.backUrl ? current.backUrl : current.imageUrl} alt="" className="aspect-[63/88] w-full object-cover" />
                    </HoloCard>
                  </button>
                  {current.backUrl ? (
                    <div className="mt-2 flex justify-center gap-1 text-[11px]">
                      <button className={`rounded-md px-2 py-0.5 ${!shownBack ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} onClick={() => setShownBack(false)}>Recto</button>
                      <button className={`rounded-md px-2 py-0.5 ${shownBack ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`} onClick={() => setShownBack(true)}>Verso</button>
                    </div>
                  ) : !current.addedCardId && (
                    <button className="mt-2 w-full text-center text-[11px] font-medium text-[var(--violet)] hover:underline" onClick={addBack}>
                      + Ajouter le verso
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-[var(--violet)]">Carte identifiée</p>
                    <h2 className="mt-0.5 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{current.ident.player || 'Joueur inconnu'}</h2>
                    <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                      {[current.ident.year, current.ident.brand, current.ident.set].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {current.ident.is_rookie && <span className="scan-chip text-[var(--blue)]">Rookie</span>}
                    {(current.ident.card_type === 'auto' || current.ident.card_type === 'auto_patch') && <span className="scan-chip text-[var(--green)]">Auto</span>}
                    {current.ident.numbered && <span className="scan-chip tabular text-[var(--violet)]">{current.ident.numbered}</span>}
                    {current.ident.parallel && current.ident.parallel !== 'Base' && <span className="scan-chip">{current.ident.parallel}</span>}
                    {current.ident.insert && <span className="scan-chip">{current.ident.insert}</span>}
                    {current.ident.card_number && <span className="scan-chip tabular">{formatCardNumber(current.ident.card_number)}</span>}
                  </div>
                </div>
              </div>

              {/* Valeur */}
              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
                  <TrendingUp size={14} /> Valeur estimée {current.estimate.source === 'active' ? '(annonces eBay en cours)' : '(ventes eBay)'}
                </div>
                {current.estimate.status === 'loading' && (
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-10 w-28 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
                    <span className="text-[13px] text-[var(--text-muted)]">Recherche des ventes…</span>
                  </div>
                )}
                {current.estimate.status === 'ready' && (
                  <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <motion.p initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="tabular text-4xl font-semibold tracking-tight">
                        ≈ {euro.format(current.estimate.value!)}
                      </motion.p>
                      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                        {current.estimate.count} {current.estimate.source === 'active' ? 'annonce' : 'vente'}{current.estimate.count! > 1 ? 's' : ''} comparable{current.estimate.count! > 1 ? 's' : ''} · de {euro.format(current.estimate.min!)} à {euro.format(current.estimate.max!)}
                        {current.estimate.broad && <span className="text-[var(--orange)]"> · toutes variantes confondues</span>}
                      </p>
                    </div>
                    {!!current.estimate.thumbs?.length && (
                      <div className="flex -space-x-3">
                        {current.estimate.thumbs.map((t, i) => (
                          <img key={i} src={t} alt="" className="h-12 w-9 rounded-md border-2 border-[var(--bg-secondary)] object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {current.estimate.status === 'none' && <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Pas assez de ventes récentes pour estimer cette carte.</p>}
                {current.estimate.status === 'error' && <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Les ventes eBay sont indisponibles pour le moment.</p>}
              </div>

              {/* Dans la collection ? */}
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--border)] px-4 py-3">
                <Library size={16} className="shrink-0 text-[var(--text-muted)]" />
                {current.addedCardId ? (
                  <p className="flex-1 text-[13px]"><Check size={14} className="-mt-0.5 mr-1 inline text-[var(--green)]" />Ajoutée à ta collection</p>
                ) : owned.length > 0 ? (
                  <p className="flex-1 text-[13px]">Tu l'as déjà <span className="text-[var(--text-muted)]">({owned.length} exemplaire{owned.length > 1 ? 's' : ''} proche{owned.length > 1 ? 's' : ''})</span></p>
                ) : (
                  <p className="flex-1 text-[13px]">Nouvelle carte pour ta collection</p>
                )}
                {(current.addedCardId || owned[0]) && (
                  <button className="ui-btn ui-btn-sm" onClick={() => setOpenCardId(current.addedCardId ?? owned[0].id)}>Voir</button>
                )}
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button className="ui-btn ui-btn-lg" onClick={again}>
                  <RotateCcw size={16} /> Scanner une autre
                </button>
                {!current.addedCardId && (
                  <button className="ui-btn ui-btn-primary ui-btn-lg" onClick={addToCollection} disabled={adding}>
                    {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {adding ? 'Ajout…' : 'Ajouter à ma collection'}
                  </button>
                )}
                {current.addedCardId && (
                  <button className="ui-btn ui-btn-lg" onClick={() => setActiveView('collection')}>
                    <Library size={16} /> Voir la collection
                  </button>
                )}
              </div>
            </div>
            <button onClick={again} className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" aria-label="Fermer">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {openCard && <CardDetail card={openCard} onClose={() => setOpenCardId(null)} />}
      {camera === 'on' && phase === 'live' && history.length === 0 && (
        <span className="sr-only"><Camera /> Caméra prête</span>
      )}
    </div>
  );
}
