import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronLeft,
  Crop,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { compressImage } from '../../lib/storage';
import { DEFAULT_CROP_RECT, clampNormRect, type NormRect } from '../../lib/guideCrop';
import { CornerCropEditor } from '../shared/CornerCropEditor';
import { useCreateCard, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useIdentify } from '../../hooks/useIdentify';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import {
  createStudioSession,
  formatStudioDuration,
  loadStudioSessions,
  type StudioSessionSummary,
  updateStudioSession,
} from '../../lib/studioSessions';
import type { CardType } from '../../types';
import { Badge, EmptyState, Notice, Page, PageHeader, Panel } from '../ui';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// Rognage auto : effectué côté serveur (OpenCV) au moment de l'upload.
const AUTO_CROP_AVAILABLE = true;
// Ratio d'une carte standard (2.5" × 3.5").
const CARD_ASPECT = 2.5 / 3.5;

type CaptureSide = 'front' | 'back';
type StudioStep = 'front' | 'back' | 'ready' | 'saving';
type CaptureMode = 'per_card' | 'halves';
type HalvesPhase = 'front' | 'back';
type CapturedPair = {
  id: string;
  frontName: string;
  backName: string;
  imageFrontUrl: string;
  imageBackUrl: string;
  // Photos capturées (compressées) gardées en mémoire pour l'identification,
  // afin d'éviter un re-téléchargement de l'image (parfois mal rognée) après upload.
  frontBlob?: File;
  backBlob?: File;
};
type FrontStackItem = {
  cardId: string;
  frontName: string;
  imageFrontUrl: string;
  frontBlob?: File;
};

type ImageCaptureLike = {
  takePhoto: () => Promise<Blob>;
};

type WindowWithImageCapture = Window & {
  ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike;
};

async function mediaTrackToFile(track: MediaStreamTrack, side: CaptureSide): Promise<File | null> {
  const ImageCaptureCtor = (window as WindowWithImageCapture).ImageCapture;
  if (!ImageCaptureCtor) return null;

  try {
    const imageCapture = new ImageCaptureCtor(track);
    const blob = await imageCapture.takePhoto();
    return new File([blob], `${side}-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
  } catch {
    return null;
  }
}

async function canvasToFile(video: HTMLVideoElement, side: CaptureSide): Promise<File> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('Flux caméra indisponible');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Capture impossible'))),
      'image/jpeg',
      0.95,
    ),
  );

  return new File([blob], `${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

async function urlToFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Impossible de relire une photo déjà uploadée');
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

async function compressToFile(file: File, name: string): Promise<File> {
  const blob = await compressImage(file);
  return new File([blob], name, { type: 'image/jpeg' });
}

function PreviewCard({
  label,
  file,
  active,
}: {
  label: string;
  file: File | null;
  active?: boolean;
}) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${active ? 'border-[var(--border-accent)] bg-[var(--accent-dim)]' : 'border-[var(--border)] bg-[var(--bg-elevated)]'}`}
      style={{ aspectRatio: '2/3' }}
    >
      {previewUrl ? (
        <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-hover)] ${active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
            <ImagePlus size={18} />
          </div>
          <div className={`text-xs ${active ? 'font-medium text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
            {active ? 'Prochaine capture' : 'En attente'}
          </div>
        </div>
      )}

      <span className="absolute left-2 top-2">
        <Badge tone={active ? 'accent' : 'neutral'}>{label}</Badge>
      </span>
    </div>
  );
}

export function StudioView() {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setReviewSessionId = useAppStore((s) => s.setReviewSessionId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [capturedPairs, setCapturedPairs] = useState<CapturedPair[]>([]);
  const [step, setStep] = useState<StudioStep>('front');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [videoAspect, setVideoAspect] = useState(4 / 3);
  const [currentSession, setCurrentSession] = useState<StudioSessionSummary | null>(null);
  const [sessionHistory, setSessionHistory] = useState<StudioSessionSummary[]>([]);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('per_card');
  const [halvesPhase, setHalvesPhase] = useState<HalvesPhase>('front');
  const [frontStack, setFrontStack] = useState<FrontStackItem[]>([]);
  const [backIndex, setBackIndex] = useState(0);

  const [autoCropEnabled, setAutoCropEnabled] = useState(
    () => localStorage.getItem('studio_autocrop') !== '0',
  );
  // Mode « Détection coins » : après capture, ouvre l'éditeur de coins (OpenCV).
  const [cornerScan, setCornerScan] = useState(
    () => localStorage.getItem('studio_corner_scan') === '1',
  );
  const [pendingCrop, setPendingCrop] = useState<{ side: CaptureSide; file: File } | null>(null);
  const [zoom, setZoom] = useState(() => {
    const v = Number(localStorage.getItem('studio_zoom'));
    return v >= 1 && v <= 3 ? v : 1;
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Cadre de rognage réglable + mémorisé (pour un support de scan fixe).
  const frameBoxRef = useRef<HTMLDivElement>(null);
  const [adjustingFrame, setAdjustingFrame] = useState(false);
  const [rotation, setRotation] = useState<number>(() => {
    const v = Number(localStorage.getItem('studio_rotation'));
    return [0, 90, 180, 270].includes(v) ? v : 0;
  });
  const [cropRect, setCropRect] = useState<NormRect>(() => {
    try {
      const raw = localStorage.getItem('studio_crop_rect');
      if (raw) return clampNormRect(JSON.parse(raw));
    } catch { /* ignore */ }
    return DEFAULT_CROP_RECT;
  });

  useEffect(() => {
    localStorage.setItem('studio_crop_rect', JSON.stringify(cropRect));
  }, [cropRect]);

  useEffect(() => {
    localStorage.setItem('studio_rotation', String(rotation));
  }, [rotation]);

  useEffect(() => {
    localStorage.setItem('studio_zoom', String(zoom));
  }, [zoom]);

  const rotated90 = rotation === 90 || rotation === 270;
  // Ratio du cadre d'affichage (largeur/hauteur en px).
  const boxAspect = rotated90 ? 1 / videoAspect : videoAspect;

  // Cadre centré verrouillé au format carte (à l'écran).
  function cardCropRect(): NormRect {
    let h = 0.84;
    let w = (h * CARD_ASPECT) / boxAspect;
    if (w > 0.96) { w = 0.96; h = (w * boxAspect) / CARD_ASPECT; }
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }

  // Aligne le cadre au format carte dès que le ratio caméra est connu (une fois
  // le persisté converti, le lock de ratio le garde carte → plus de reset).
  useEffect(() => {
    const screenRatio = (cropRect.w / cropRect.h) * boxAspect;
    if (Math.abs(screenRatio - CARD_ASPECT) > 0.04) setCropRect(cardCropRect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoAspect]);

  function startFrameDrag(
    e: React.PointerEvent,
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se',
  ) {
    e.preventDefault();
    e.stopPropagation();
    const box = frameBoxRef.current;
    if (!box) return;
    const rectPx = box.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const base = { ...cropRect };

    function onMove(ev: PointerEvent) {
      // Le cadre est affiché à l'échelle du zoom : une distance écran
      // correspond à (distance / zoom) dans l'espace image.
      const dx = (ev.clientX - start.x) / rectPx.width / zoom;
      const dy = (ev.clientY - start.y) / rectPx.height / zoom;
      let next: NormRect;
      if (mode === 'move') {
        next = { ...base, x: base.x + dx, y: base.y + dy };
      } else {
        // Redimensionnement verrouillé au ratio carte : la largeur pilote,
        // la hauteur en découle, et le coin opposé reste ancré.
        const right = base.x + base.w;
        const bottom = base.y + base.h;
        let w = mode === 'nw' || mode === 'sw' ? base.w - dx : base.w + dx;
        w = Math.max(0.08, w);
        const h = (w * boxAspect) / CARD_ASPECT;
        let x = base.x, y = base.y;
        if (mode === 'nw') { x = right - w; y = bottom - h; }
        if (mode === 'ne') { x = base.x; y = bottom - h; }
        if (mode === 'sw') { x = right - w; y = base.y; }
        if (mode === 'se') { x = base.x; y = base.y; }
        next = { x, y, w, h };
      }
      setCropRect(clampNormRect(next));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  useEffect(() => {
    localStorage.setItem('studio_autocrop', autoCropEnabled ? '1' : '0');
  }, [autoCropEnabled]);

  useEffect(() => {
    localStorage.setItem('studio_corner_scan', cornerScan ? '1' : '0');
  }, [cornerScan]);

  const identify = useIdentify();
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();

  useEffect(() => {
    setSessionHistory(loadStudioSessions());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      setCameraError('');
      setCameraReady(false);

      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 4096 },
          height: { ideal: 3072 },
          aspectRatio: { ideal: 4 / 3 },
        };
        if (selectedDeviceId) {
          videoConstraints.deviceId = { exact: selectedDeviceId };
        } else {
          videoConstraints.facingMode = facingMode;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const vtrack = stream.getVideoTracks()[0];
        setActiveDeviceId(vtrack?.getSettings().deviceId ?? null);
        const vw = videoRef.current?.videoWidth || vtrack?.getSettings().width;
        const vh = videoRef.current?.videoHeight || vtrack?.getSettings().height;
        if (vw && vh) setVideoAspect(vw / vh);
        setCameraReady(true);

        // Les labels ne sont dispo qu'après autorisation.
        try {
          const all = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput'));
        } catch {
          /* ignore */
        }
      } catch (error) {
        setCameraError((error as Error).message || 'Impossible d’accéder à la caméra');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode, selectedDeviceId]);

  // Rafraîchit la liste quand une caméra est branchée/débranchée (ex. Continuity Camera iPhone).
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const refresh = () => {
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => setDevices(all.filter((d) => d.kind === 'videoinput')))
        .catch(() => {});
    };
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, []);

  function resetCurrentPair() {
    setFrontFile(null);
    setBackFile(null);
    setStep('front');
    setSaveError('');
  }

  function resetSession() {
    resetCurrentPair();
    setCapturedPairs([]);
    setSaveMessage('');
    setHalvesPhase('front');
    setFrontStack([]);
    setBackIndex(0);
  }

  function ensureSession() {
    if (currentSession) return currentSession;
    const session = createStudioSession();
    setCurrentSession(session);
    setSessionHistory(loadStudioSessions());
    return session;
  }

  async function takePhoto(side: CaptureSide): Promise<File> {
    if (!videoRef.current) throw new Error('Flux caméra indisponible');
    const track = streamRef.current?.getVideoTracks()[0] ?? null;
    return (
      (track ? await mediaTrackToFile(track, side) : null) ??
      (await canvasToFile(videoRef.current, side))
    );
  }

  // Capture la photo. Si le rognage auto est activé, on rogne sur la zone exacte
  // du cadre-guide. Le zoom numérique est appliqué dans les deux cas.
  // Capture EXACTEMENT ce qui est affiché : on redessine la scène (vidéo
  // tournée + zoomée pour remplir la boîte d'aperçu) puis on découpe la zone
  // du cadre orange telle qu'elle apparaît à l'écran. WYSIWYG garanti.
  async function captureFramed(side: CaptureSide, rect: NormRect | null): Promise<File> {
    const video = videoRef.current;
    const box = frameBoxRef.current;
    if (!video || !box) throw new Error('Flux caméra indisponible');
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) throw new Error('Flux caméra indisponible');

    const bw = box.clientWidth || 1;
    const bh = box.clientHeight || 1;
    // On rend la scène à la résolution native de la caméra (plafonnée), pas à
    // la taille de l'aperçu : drawImage échantillonne le flux natif -> aucune
    // perte de qualité notable par rapport au capteur.
    const targetLong = Math.min(4096, Math.max(vw, vh));
    const K = Math.max(1, targetLong / Math.max(bw, bh));

    const scene = document.createElement('canvas');
    scene.width = Math.round(bw * K);
    scene.height = Math.round(bh * K);
    const ctx = scene.getContext('2d');
    if (!ctx) throw new Error('Canvas context indisponible');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(K, K);
    ctx.translate(bw / 2, bh / 2);
    ctx.scale(zoom, zoom);
    ctx.rotate((rotation * Math.PI) / 180);
    const dw = rotated90 ? bh : bw;
    const dh = rotated90 ? bw : bh;
    ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);

    // Rectangle du cadre tel qu'affiché (mis à l'échelle du zoom, centré).
    const r = rect ? clampNormRect(rect) : { x: 0, y: 0, w: 1, h: 1 };
    const xn = 0.5 + (r.x - 0.5) * zoom;
    const yn = 0.5 + (r.y - 0.5) * zoom;
    const wn = r.w * zoom;
    const hn = r.h * zoom;
    const sx = Math.max(0, Math.round(xn * bw * K));
    const sy = Math.max(0, Math.round(yn * bh * K));
    const sw = Math.max(1, Math.min(scene.width - sx, Math.round(wn * bw * K)));
    const sh = Math.max(1, Math.min(scene.height - sy, Math.round(hn * bh * K)));

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('Canvas context indisponible');
    octx.drawImage(scene, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Capture impossible'))),
        'image/jpeg',
        0.95,
      ),
    );
    return new File([blob], `${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
  }

  async function capturePhoto(side: CaptureSide): Promise<File> {
    const video = videoRef.current;
    // Mode détection coins : on capture l'image pleine (l'éditeur détecte et
    // redresse ensuite).
    if (video && cornerScan) {
      return captureFramed(side, null);
    }
    if (video && AUTO_CROP_AVAILABLE && autoCropEnabled) {
      return captureFramed(side, cropRect);
    }
    if (video && (rotation !== 0 || zoom > 1)) {
      return captureFramed(side, null);
    }
    return takePhoto(side);
  }

  // Applique le fichier capturé (après recadrage éventuel) au flux recto/verso.
  function applyCaptured(side: CaptureSide, file: File) {
    if (side === 'front') {
      setFrontFile(file);
      setStep('back');
    } else {
      setBackFile(file);
      setStep('ready');
    }
  }

  async function handleCapture() {
    if (!videoRef.current) return;
    setSaveError('');
    setSaveMessage('');

    if (captureMode === 'halves') {
      if (halvesPhase === 'front') return captureHalvesFront();
      return captureHalvesBack();
    }

    try {
      const side: CaptureSide = step === 'back' ? 'back' : 'front';
      const file = await capturePhoto(side);

      // Mode détection coins : passe par l'éditeur avant de valider.
      if (cornerScan) {
        setPendingCrop({ side, file });
        return;
      }
      applyCaptured(side, file);
    } catch (error) {
      setSaveError((error as Error).message);
    }
  }

  function recapture(side: CaptureSide) {
    if (side === 'front') {
      setFrontFile(null);
      setStep('front');
      return;
    }
    setBackFile(null);
    setStep('back');
  }

  async function queueCurrentPair() {
    if (!frontFile || !backFile) return;

    setStep('saving');
    setSaveError('');
    setSaveMessage('Création du brouillon…');
    let createdCardId: string | null = null;

    try {
      const session = ensureSession();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Non authentifié');

      const newCard = await createCard.mutateAsync({ status: 'draft' });
      createdCardId = newCard.id;

      setSaveMessage('Upload des photos…');
      const [frontCompressed, backCompressed] = await Promise.all([
        compressToFile(frontFile, 'front.jpg'),
        compressToFile(backFile, 'back.jpg'),
      ]);
      const [imageFrontUrl, imageBackUrl] = await Promise.all([
        uploadViaBackend(frontCompressed, newCard.id, token, 'front'),
        uploadViaBackend(backCompressed, newCard.id, token, 'back'),
      ]);

      await updateCard.mutateAsync({
        id: newCard.id,
        image_front_url: imageFrontUrl,
        image_back_url: imageBackUrl,
      });

      setCapturedPairs((prev) => [
        ...prev,
        {
          id: newCard.id,
          frontName: frontFile.name,
          backName: backFile.name,
          imageFrontUrl,
          imageBackUrl,
          frontBlob: frontCompressed,
          backBlob: backCompressed,
        },
      ]);
      const updated = updateStudioSession(session.id, (draft) => ({
        ...draft,
        capturedCount: draft.capturedCount + 1,
        cardIds: [...draft.cardIds, newCard.id],
      }));
      if (updated) setCurrentSession(updated);
      setSessionHistory(loadStudioSessions());
      resetCurrentPair();
      setSaveMessage('Paire enregistrée en brouillon. IA plus tard.');
    } catch (error) {
      const message = (error as Error).message;
      if (createdCardId) {
        try {
          await deleteCard.mutateAsync(createdCardId);
        } catch {
          setSaveError(`Échec pendant l’enregistrement du brouillon. La carte a peut-être été créée partiellement. Détail: ${message}`);
          setStep('ready');
          return;
        }
      }
      setSaveError(message);
      setStep('ready');
    }
  }

  // ── Mode lot : tous les recto puis tous les verso ──────────────────────────

  async function captureHalvesFront() {
    setStep('saving');
    setSaveError('');
    setSaveMessage('Recto : création du brouillon…');
    let createdCardId: string | null = null;

    try {
      const file = await capturePhoto('front');
      const session = ensureSession();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Non authentifié');

      const newCard = await createCard.mutateAsync({ status: 'draft' });
      createdCardId = newCard.id;

      setSaveMessage('Upload du recto…');
      const frontCompressed = await compressToFile(file, 'front.jpg');
      const imageFrontUrl = await uploadViaBackend(frontCompressed, newCard.id, token, 'front');
      await updateCard.mutateAsync({ id: newCard.id, image_front_url: imageFrontUrl });

      setFrontStack((prev) => [
        ...prev,
        { cardId: newCard.id, frontName: file.name, imageFrontUrl, frontBlob: frontCompressed },
      ]);
      const updated = updateStudioSession(session.id, (draft) => ({
        ...draft,
        capturedCount: draft.capturedCount + 1,
        cardIds: [...draft.cardIds, newCard.id],
      }));
      if (updated) setCurrentSession(updated);
      setSessionHistory(loadStudioSessions());
      setStep('front');
      setSaveMessage('Recto enregistré. Continue ou passe aux verso.');
    } catch (error) {
      const message = (error as Error).message;
      if (createdCardId) {
        try {
          await deleteCard.mutateAsync(createdCardId);
        } catch {
          /* le brouillon recto-seul reste, sera visible en revue */
        }
      }
      setSaveError(message);
      setStep('front');
    }
  }

  function goToBackPhase() {
    if (frontStack.length === 0) return;
    setBackIndex(0);
    setHalvesPhase('back');
    setSaveError('');
    setSaveMessage('Capture les verso dans le même ordre que les recto.');
  }

  async function removeLastFront() {
    const last = frontStack[frontStack.length - 1];
    if (!last) return;
    await removePair(last.cardId);
    setFrontStack((prev) => prev.slice(0, -1));
  }

  async function captureHalvesBack() {
    const target = frontStack[backIndex];
    if (!target) return;

    setStep('saving');
    setSaveError('');
    setSaveMessage(`Verso ${backIndex + 1}/${frontStack.length} : upload…`);

    try {
      const file = await capturePhoto('back');
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Non authentifié');

      const backCompressed = await compressToFile(file, 'back.jpg');
      const imageBackUrl = await uploadViaBackend(backCompressed, target.cardId, token, 'back');
      await updateCard.mutateAsync({ id: target.cardId, image_back_url: imageBackUrl });

      setCapturedPairs((prev) => [
        ...prev,
        {
          id: target.cardId,
          frontName: target.frontName,
          backName: file.name,
          imageFrontUrl: target.imageFrontUrl,
          imageBackUrl,
          frontBlob: target.frontBlob,
          backBlob: backCompressed,
        },
      ]);
      const nextIndex = backIndex + 1;
      setBackIndex(nextIndex);
      setStep('front');
      if (nextIndex >= frontStack.length) {
        setSaveMessage('Tous les verso capturés. Tu peux traiter le lot.');
      } else {
        setSaveMessage(`Verso ${backIndex + 1} enregistré.`);
      }
    } catch (error) {
      setSaveError((error as Error).message);
      setStep('front');
    }
  }

  function undoLastBack() {
    if (backIndex === 0) return;
    const prevIndex = backIndex - 1;
    const undone = frontStack[prevIndex];
    setCapturedPairs((prev) => prev.filter((pair) => pair.id !== undone.cardId));
    setBackIndex(prevIndex);
    setSaveError('');
    setSaveMessage(`Reprends le verso ${prevIndex + 1}.`);
  }

  async function removePair(id: string) {
    await deleteCard.mutateAsync(id);
    setCapturedPairs((prev) => prev.filter((pair) => pair.id !== id));
    if (currentSession) {
      const updated = updateStudioSession(currentSession.id, (session) => ({
        ...session,
        capturedCount: Math.max(0, session.capturedCount - 1),
        cardIds: session.cardIds.filter((cardId) => cardId !== id),
        processedCardIds: session.processedCardIds.filter((cardId) => cardId !== id),
      }));
      if (updated) setCurrentSession(updated);
    }
    setSessionHistory(loadStudioSessions());
  }

  // `compressed` est déjà compressé (cf. compressToFile). Le rognage est fait
  // côté client (cf. cropVideoToGuide) avant compression.
  async function uploadViaBackend(compressed: File, cardId: string, token: string, side: CaptureSide): Promise<string> {
    const form = new FormData();
    form.append('file', new File([compressed], `${side}.jpg`, { type: 'image/jpeg' }));
    form.append('card_id', cardId);
    form.append('side', side);
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) throw new Error(`Upload ${side}: ${await response.text()}`);
    return (await response.json()).url;
  }

  async function identifyDraftPair(pair: CapturedPair) {
    // On identifie en priorité depuis les photos gardées en mémoire (évite le
    // re-téléchargement juste après upload et une éventuelle image mal rognée).
    const [frontFileForAI, backFileForAI] = await Promise.all([
      pair.frontBlob ?? urlToFile(pair.imageFrontUrl, pair.frontName),
      pair.backBlob ?? urlToFile(pair.imageBackUrl, pair.backName),
    ]);

    // L'identification du studio échoue parfois de façon transitoire (réseau,
    // réponse vide du modèle). On relance une fois si besoin.
    async function runIdentify() {
      return identify.mutateAsync({
        frontFile: frontFileForAI,
        backFile: backFileForAI,
      });
    }

    let identifyResult = await runIdentify().catch((err) => {
      console.warn('[studio identify] 1er essai échoué, relance…', err);
      return null;
    });

    const isEmpty = (r: typeof identifyResult) =>
      !r || (!r.player && !r.card_number && !r.year && !r.set);

    if (isEmpty(identifyResult)) {
      await new Promise((r) => setTimeout(r, 800));
      identifyResult = await runIdentify();
    }

    if (isEmpty(identifyResult)) {
      throw new Error('Identification vide après 2 essais');
    }

    const result = identifyResult!;
    await updateCard.mutateAsync({
      id: pair.id,
      sport: result.sport || 'Basket',
      player: result.player || null,
      team: result.team || null,
      year: result.year || null,
      brand: result.brand || null,
      set_name: result.set || null,
      card_type: (result.card_type || null) as CardType | null,
      insert_name: result.insert || null,
      parallel_name: result.parallel || null,
      parallel_confidence: result.parallel_confidence ?? null,
      card_number: result.card_number || null,
      numbered: result.numbered || null,
      is_rookie: result.is_rookie ?? null,
      condition_notes: result.condition_notes || null,
    });
  }

  async function handleProcessBatch(openReviewAfterSave: boolean) {
    const pairsToProcess = [...capturedPairs];
    if (pairsToProcess.length === 0) return;

    setStep('saving');
    setSaveError('');
    const batchErrors: string[] = [];

    try {
      for (let index = 0; index < pairsToProcess.length; index += 1) {
        setSaveMessage(`Traitement du lot ${index + 1}/${pairsToProcess.length}…`);
        try {
          await identifyDraftPair(pairsToProcess[index]);
          if (currentSession) {
            const updated = updateStudioSession(currentSession.id, (session) => ({
              ...session,
              processedAt: new Date().toISOString(),
              processedCount: session.processedCount + 1,
              processedCardIds: session.processedCardIds.includes(pairsToProcess[index].id)
                ? session.processedCardIds
                : [...session.processedCardIds, pairsToProcess[index].id],
            }));
            if (updated) setCurrentSession(updated);
          }
        } catch (error) {
          const message = (error as Error).message;
          console.error(`[studio] échec identification carte ${index + 1}`, error);
          batchErrors.push(`Carte ${index + 1}: ${message}`);
          if (currentSession) {
            const updated = updateStudioSession(currentSession.id, (session) => ({
              ...session,
              processedAt: new Date().toISOString(),
              errorsCount: session.errorsCount + 1,
              lastError: message,
            }));
            if (updated) setCurrentSession(updated);
          }
        }
      }

      setSessionHistory(loadStudioSessions());
      resetSession();
      if (batchErrors.length > 0) {
        setSaveError(`${batchErrors.length} carte(s) en échec — ${batchErrors.join(' · ')}`);
      }
      if (openReviewAfterSave) {
        if (currentSession) setReviewSessionId(currentSession.id);
        setActiveView('review');
      } else {
        setSaveMessage(`${pairsToProcess.length} brouillon${pairsToProcess.length > 1 ? 's' : ''} créé${pairsToProcess.length > 1 ? 's' : ''}.`);
      }
    } catch (error) {
      setSaveError((error as Error).message);
      setStep(frontFile && backFile ? 'ready' : 'front');
    }
  }

  const isBusy =
    step === 'saving' ||
    identify.isPending ||
    createCard.isPending ||
    updateCard.isPending ||
    deleteCard.isPending;

  const halvesBackDone =
    captureMode === 'halves' && halvesPhase === 'back' && backIndex >= frontStack.length;
  const primaryDisabled =
    !!cameraError || !cameraReady || isBusy || halvesBackDone;

  const primaryAction = (() => {
    if (captureMode === 'halves') {
      if (halvesPhase === 'front') {
        return { label: `Capturer le recto${frontStack.length ? ` (${frontStack.length})` : ''}`, icon: Camera, onClick: handleCapture };
      }
      if (halvesBackDone) {
        return { label: 'Tous les verso capturés', icon: CheckCircle2, onClick: () => {} };
      }
      return { label: `Capturer le verso (${backIndex + 1}/${frontStack.length})`, icon: Camera, onClick: handleCapture };
    }
    return step === 'ready'
      ? { label: 'Enregistrer et carte suivante', icon: Archive, onClick: queueCurrentPair }
      : {
          label: step === 'front' ? 'Capturer le recto' : 'Capturer le verso',
          icon: Camera,
          onClick: handleCapture,
        };
  })();

  const stepLabel = (() => {
    if (captureMode === 'halves') {
      if (step === 'saving') return 'ENREGISTREMENT';
      if (halvesPhase === 'front') return `RECTO ${frontStack.length + 1}`;
      return halvesBackDone ? 'TERMINÉ' : `VERSO ${backIndex + 1}/${frontStack.length}`;
    }
    return step === 'front'
      ? 'RECTO'
      : step === 'back'
        ? 'VERSO'
        : step === 'ready'
          ? 'ENREGISTRE'
          : 'ENREGISTREMENT';
  })();

  const lotCount = capturedPairs.length;
  const sessionStarted =
    capturedPairs.length > 0 || frontStack.length > 0 || !!frontFile || !!backFile;

  function switchMode(mode: CaptureMode) {
    if (mode === captureMode || sessionStarted || isBusy) return;
    setCaptureMode(mode);
    resetCurrentPair();
    setHalvesPhase('front');
    setBackIndex(0);
    setSaveMessage('');
    setSaveError('');
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? '';
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (isBusy) return;

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        // Évite qu'un bouton ayant le focus soit aussi déclenché par la barre d'espace.
        if (target?.tagName === 'BUTTON') target.blur();
        if (!primaryDisabled) primaryAction.onClick();
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        resetCurrentPair();
        return;
      }

      if (event.key === 'Backspace' && captureMode === 'per_card' && capturedPairs.length > 0 && step === 'front') {
        event.preventDefault();
        removePair(capturedPairs[capturedPairs.length - 1].id);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capturedPairs, isBusy, primaryDisabled, primaryAction, step, captureMode]);

  const processDisabled = capturedPairs.length === 0 || isBusy || (captureMode === 'halves' && !halvesBackDone);
  const cameraLabel = selectedDeviceId
    ? (devices.find((d) => d.deviceId === selectedDeviceId)?.label || 'Caméra choisie')
    : facingMode === 'environment' ? 'Caméra arrière' : 'Caméra avant';
  const barHint = step === 'saving' && saveMessage
    ? saveMessage
    : captureMode === 'halves'
      ? halvesPhase === 'front'
        ? 'Phase recto : capture tous les recto.'
        : halvesBackDone
          ? 'Verso terminés : traite le lot.'
          : 'Phase verso : suis le guide recto.'
      : 'Bluetooth : recto, verso, enregistrement.';

  return (
    <Page width="wide">
      <PageHeader
        title="Studio photo"
        subtitle="Mode trépied : capture les cartes en série, l’IA les identifie ensuite."
        actions={
          <button onClick={() => setActiveView('collection')} className="ui-btn ui-btn-ghost">
            <ChevronLeft size={16} /> Collection
          </button>
        }
      />

      {/* Réglages de capture et caméra */}
      <div className="ui-card flex flex-wrap items-center gap-2 p-3">
        <div
          className="ui-segmented"
          title={sessionStarted ? 'Termine ou réinitialise le lot pour changer de mode' : undefined}
        >
          {([
            { id: 'per_card', label: 'Carte par carte' },
            { id: 'halves', label: 'Recto puis verso' },
          ] as { id: CaptureMode; label: string }[]).map((opt) => (
            <button
              key={opt.id}
              onClick={() => switchMode(opt.id)}
              disabled={sessionStarted || isBusy}
              data-active={captureMode === opt.id}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          hidden={!AUTO_CROP_AVAILABLE}
          onClick={() => setAutoCropEnabled((v) => { const nv = !v; if (nv) setCornerScan(false); return nv; })}
          disabled={sessionStarted || isBusy}
          data-active={autoCropEnabled}
          aria-pressed={autoCropEnabled}
          title={sessionStarted ? 'Réinitialise le lot pour changer le rognage' : 'Détecte les bords et rogne automatiquement (serveur)'}
          className="ui-btn"
        >
          <ScanLine size={15} />
          Cadre fixe
        </button>

        <button
          onClick={() => setCornerScan((v) => { const nv = !v; if (nv) setAutoCropEnabled(false); return nv; })}
          disabled={sessionStarted || isBusy || captureMode === 'halves'}
          data-active={cornerScan}
          aria-pressed={cornerScan}
          title={sessionStarted ? 'Réinitialise le lot pour changer le mode' : 'Détecte les coins de la carte et redresse en perspective'}
          className="ui-btn"
        >
          <Crop size={15} />
          Détection coins
        </button>

        {autoCropEnabled && (
          <>
            <button
              onClick={() => setAdjustingFrame((v) => !v)}
              disabled={isBusy}
              data-active={adjustingFrame}
              title="Régler la zone de rognage pour ton support de scan (mémorisé)"
              className="ui-btn"
            >
              <Crop size={15} />
              {adjustingFrame ? 'Terminer le réglage' : 'Ajuster le cadre'}
            </button>
            {adjustingFrame && (
              <button
                onClick={() => setCropRect(cardCropRect())}
                title="Cadre centré au format carte (2.5×3.5)"
                className="ui-btn ui-btn-ghost"
              >
                <RotateCcw size={15} />
                Format carte
              </button>
            )}
          </>
        )}

        <div className="hidden h-6 w-px bg-[var(--border-strong)] sm:block" />

        {devices.length > 1 && (
          <select
            value={selectedDeviceId ?? activeDeviceId ?? ''}
            onChange={(e) => setSelectedDeviceId(e.target.value || null)}
            disabled={isBusy}
            title="Choisir la caméra (ex. iPhone via Continuity Camera)"
            className="ui-select w-auto max-w-[220px] truncate disabled:opacity-40"
          >
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Caméra ${i + 1}`}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => { setSelectedDeviceId(null); setFacingMode((value) => (value === 'environment' ? 'user' : 'environment')); }}
          className="ui-btn"
          disabled={isBusy}
        >
          <RefreshCw size={15} />
          Avant / Arrière
        </button>

        <button
          onClick={() => setRotation((r) => (r + 90) % 360)}
          className="ui-btn"
          disabled={isBusy}
          data-active={rotation !== 0}
          title="Tourne l'aperçu et la photo de 90° (support de scan en travers)"
        >
          <RotateCw size={15} />
          Pivoter 90°{rotation ? ` (${rotation}°)` : ''}
        </button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_380px]">
        <section className="ui-card relative overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-[var(--text-muted)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Caméra</h2>
              {lotCount > 0 && <Badge tone="accent" className="tabular">{lotCount} en lot</Badge>}
            </div>
            <Badge className="max-w-[200px] truncate">{cameraLabel}</Badge>
          </header>

          <div className="relative min-h-[46vh] bg-black sm:aspect-[4/3] sm:min-h-0">
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <EmptyState icon={CameraOff} title="Caméra indisponible" description={cameraError} />
              </div>
            ) : (
              <>
                <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
                  <div
                    ref={frameBoxRef}
                    className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-black"
                    style={{ height: '100%', maxWidth: '100%', aspectRatio: rotated90 ? 1 / videoAspect : videoAspect, containerType: 'size' }}
                  >
                    <video
                      ref={videoRef}
                      className="absolute left-1/2 top-1/2 object-contain transition-transform"
                      style={{
                        width: rotated90 ? '100cqh' : '100cqw',
                        height: rotated90 ? '100cqw' : '100cqh',
                        transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${zoom})`,
                        transformOrigin: 'center',
                      }}
                      autoPlay
                      muted
                      playsInline
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
                      }}
                    />
                    <div className="absolute inset-0">
                      <div
                        className={`absolute rounded-[0.35rem] border-2 border-[var(--accent)] shadow-[0_0_0_2px_rgba(0,0,0,0.65),0_0_0_9999px_rgba(0,0,0,0.5)] ${adjustingFrame ? 'cursor-move touch-none' : 'pointer-events-none'}`}
                        style={{
                          left: `${(0.5 + (cropRect.x - 0.5) * zoom) * 100}%`,
                          top: `${(0.5 + (cropRect.y - 0.5) * zoom) * 100}%`,
                          width: `${cropRect.w * zoom * 100}%`,
                          height: `${cropRect.h * zoom * 100}%`,
                        }}
                        onPointerDown={adjustingFrame ? (e) => startFrameDrag(e, 'move') : undefined}
                      >
                        {[
                          'left-1.5 top-1.5 border-l-[3px] border-t-[3px] rounded-tl-[0.2rem]',
                          'right-1.5 top-1.5 border-r-[3px] border-t-[3px] rounded-tr-[0.2rem]',
                          'left-1.5 bottom-1.5 border-l-[3px] border-b-[3px] rounded-bl-[0.2rem]',
                          'right-1.5 bottom-1.5 border-r-[3px] border-b-[3px] rounded-br-[0.2rem]',
                        ].map((c) => (
                          <div
                            key={c}
                            className={`absolute h-6 w-6 border-[var(--accent)] drop-shadow-[0_0_2px_rgba(0,0,0,0.9)] ${c}`}
                          />
                        ))}
                        {adjustingFrame && ([
                          ['nw', '-left-2.5 -top-2.5 cursor-nwse-resize'],
                          ['ne', '-right-2.5 -top-2.5 cursor-nesw-resize'],
                          ['sw', '-left-2.5 -bottom-2.5 cursor-nesw-resize'],
                          ['se', '-right-2.5 -bottom-2.5 cursor-nwse-resize'],
                        ] as const).map(([pos, cls]) => (
                          <div
                            key={pos}
                            onPointerDown={(e) => startFrameDrag(e, pos)}
                            className={`absolute h-5 w-5 touch-none rounded-full border-2 border-black bg-[var(--accent)] ${cls}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Étape en cours, lisible de loin (mode trépied) */}
                <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4 sm:top-6">
                  <div className="rounded-lg border border-[var(--border-strong)] bg-black/75 px-4 py-2 text-lg font-semibold tracking-wide text-[var(--text-primary)] sm:px-6 sm:text-2xl">
                    {stepLabel}
                  </div>
                </div>

                {autoCropEnabled && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4 sm:bottom-20">
                    <div className="rounded-md border border-[var(--border-accent)] bg-black/75 px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
                      {adjustingFrame
                        ? 'Déplace le cadre et tire les coins pour matcher ta carte'
                        : 'Cadre fixe (format carte) — aligne ta carte dedans'}
                    </div>
                  </div>
                )}

                <div className="absolute bottom-3 left-1/2 flex w-[calc(100%-1.5rem)] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-5 sm:w-auto">
                  {!cameraReady && (
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-black/75 px-3 py-2 text-xs text-[var(--text-secondary)]">
                      <RefreshCw size={13} className="animate-spin" />
                      Initialisation caméra…
                    </div>
                  )}
                  {cameraReady && (
                    <div className="flex h-10 items-center gap-3 rounded-lg border border-[var(--border-strong)] bg-black/75 px-3">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">Zoom</span>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.1}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="h-1 w-32 cursor-pointer accent-[var(--accent)] sm:w-44"
                        aria-label="Zoom"
                      />
                      <span className="tabular w-9 text-right text-xs font-medium text-[var(--text-primary)]">{zoom.toFixed(1)}×</span>
                      {zoom > 1 && (
                        <button onClick={() => setZoom(1)} className="ui-btn ui-btn-sm h-7">
                          Reset
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          {captureMode === 'per_card' ? (
            <Panel
              title={`Recto / Verso${capturedPairs.length > 0 ? ` · ${capturedPairs.length} en lot` : ''}`}
              icon={ImagePlus}
              action={(frontFile || backFile) ? (
                <button onClick={resetCurrentPair} disabled={isBusy} className="ui-btn ui-btn-ghost ui-btn-sm">
                  <RotateCcw size={14} />
                  Reset paire
                </button>
              ) : undefined}
            >
              <div className="grid grid-cols-2 gap-3">
                <PreviewCard label="Recto" file={frontFile} active={step === 'front'} />
                <PreviewCard label="Verso" file={backFile} active={step === 'back'} />
              </div>

              {(frontFile || backFile) && (
                <div className="mt-3 flex gap-2">
                  {frontFile && (
                    <button onClick={() => recapture('front')} disabled={isBusy} className="ui-btn flex-1">
                      Reprendre recto
                    </button>
                  )}
                  {backFile && (
                    <button onClick={() => recapture('back')} disabled={isBusy} className="ui-btn flex-1">
                      Reprendre verso
                    </button>
                  )}
                </div>
              )}
            </Panel>
          ) : halvesPhase === 'front' ? (
            <Panel
              title="Phase 1 — Recto"
              icon={ImagePlus}
              action={<Badge tone={frontStack.length ? 'accent' : 'neutral'} className="tabular">{frontStack.length} capturé{frontStack.length > 1 ? 's' : ''}</Badge>}
            >
              <p className="text-[13px] text-[var(--text-muted)]">
                Photographie tous les recto dans l'ordre, puis passe aux verso.
              </p>
              {frontStack.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-[var(--text-muted)]">Touche une vignette pour vérifier la netteté.</p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {frontStack.map((item, i) => (
                      <button
                        key={item.cardId}
                        onClick={() => setPreviewUrl(item.imageFrontUrl)}
                        className="relative overflow-hidden rounded-md border border-[var(--border)] bg-black transition-colors hover:border-[var(--border-strong)]"
                        style={{ aspectRatio: '2/3' }}
                      >
                        <img src={item.imageFrontUrl} alt={`Recto ${i + 1}`} className="h-full w-full object-cover" />
                        <span className="tabular absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-medium text-[var(--text-primary)]">{i + 1}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 space-y-2">
                <button
                  onClick={goToBackPhase}
                  disabled={frontStack.length === 0 || isBusy}
                  data-active={frontStack.length > 0}
                  className="ui-btn w-full"
                >
                  Passer aux verso ({frontStack.length})
                </button>
                {frontStack.length > 0 && (
                  <button onClick={removeLastFront} disabled={isBusy} className="ui-btn ui-btn-danger ui-btn-sm w-full">
                    <Trash2 size={14} />
                    Retirer le dernier recto
                  </button>
                )}
              </div>
            </Panel>
          ) : (
            <Panel
              title="Phase 2 — Verso"
              icon={ImagePlus}
              action={<Badge tone={halvesBackDone ? 'green' : 'accent'} className="tabular">{halvesBackDone ? 'Terminé' : `${backIndex + 1} / ${frontStack.length}`}</Badge>}
            >
              {halvesBackDone ? (
                <Notice tone="success" icon={CheckCircle2}>Tous les verso capturés.</Notice>
              ) : (
                <>
                  <p className="text-xs font-medium text-[var(--text-secondary)]">
                    Recto à apparier (carte {backIndex + 1})
                  </p>
                  <div
                    className="mt-2 overflow-hidden rounded-lg border border-[var(--border-accent)] bg-black"
                    style={{ aspectRatio: '2/3' }}
                  >
                    <img
                      src={frontStack[backIndex].imageFrontUrl}
                      alt={`Recto carte ${backIndex + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Place le verso correspondant à ce recto, puis capture.
                  </p>
                </>
              )}

              {backIndex > 0 && !halvesBackDone && (
                <button onClick={undoLastBack} disabled={isBusy} className="ui-btn ui-btn-sm mt-3 w-full">
                  <RotateCcw size={14} />
                  Annuler le dernier verso
                </button>
              )}
            </Panel>
          )}

          <Panel title="Lot" icon={Archive}>
            <div className="space-y-4">
              {currentSession && (
                <div className="rounded-lg border border-[var(--border-accent)] bg-[var(--accent-dim)] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{currentSession.tag}</span>
                    <Badge tone="accent">Session active</Badge>
                  </div>
                  <p className="tabular mt-0.5 text-xs text-[var(--text-muted)]">
                    {currentSession.capturedCount} carte{currentSession.capturedCount > 1 ? 's' : ''} · {formatStudioDuration(currentSession.startedAt)}
                  </p>
                </div>
              )}

              <p className="text-[13px] text-[var(--text-muted)]">
                L’identification IA se lance après la capture, sur tout le lot.
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => handleProcessBatch(false)}
                  disabled={processDisabled}
                  data-active={!processDisabled}
                  className="ui-btn w-full"
                >
                  {isBusy && step === 'saving' ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                  Traiter le lot
                </button>
                <button
                  onClick={() => handleProcessBatch(true)}
                  disabled={processDisabled}
                  className="ui-btn w-full"
                >
                  <Sparkles size={15} />
                  Traiter le lot et ouvrir la revue
                </button>
              </div>

              {step === 'saving' && saveMessage ? (
                <Notice tone="info">
                  <span className="flex items-center gap-2">
                    <RefreshCw size={14} className="shrink-0 animate-spin" />
                    {saveMessage}
                  </span>
                </Notice>
              ) : saveMessage ? (
                <Notice tone="success" icon={CheckCircle2}>{saveMessage}</Notice>
              ) : null}

              {saveError && <Notice tone="error">{saveError}</Notice>}

              {capturedPairs.length > 0 && !(captureMode === 'halves' && halvesPhase === 'back' && !halvesBackDone) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">Lot capturé</p>
                  <div className="max-h-64 divide-y divide-[var(--border)] overflow-auto rounded-lg border border-[var(--border)]">
                    {capturedPairs.map((pair, index) => (
                      <div key={pair.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[var(--text-primary)]">Paire {index + 1}</div>
                          <div className="truncate text-xs text-[var(--text-muted)]">
                            {pair.frontName} · {pair.backName}
                          </div>
                        </div>
                        <button
                          onClick={() => removePair(pair.id)}
                          disabled={isBusy}
                          className="ui-btn ui-btn-danger ui-btn-sm shrink-0"
                        >
                          <Trash2 size={14} />
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {sessionHistory.length > 0 && (
            <Panel title="Historique des sessions" padded={false}>
              <div className="divide-y divide-[var(--border)]">
                {sessionHistory.slice(0, 4).map((session) => (
                  <div key={session.id} className="px-4 py-3">
                    <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">{session.tag}</div>
                    <div className="tabular mt-0.5 text-xs text-[var(--text-muted)]">
                      {session.capturedCount} carte{session.capturedCount > 1 ? 's' : ''} · {session.processedCount} traitée{session.processedCount > 1 ? 's' : ''} · {session.errorsCount} erreur{session.errorsCount > 1 ? 's' : ''}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Durée : {formatStudioDuration(session.startedAt, session.processedAt ?? session.updatedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </aside>
      </div>

      {/* Réserve la place de la barre d'action fixe */}
      <div aria-hidden className="h-48 lg:h-40" />

      {/* Barre d'action principale, au-dessus de la barre d'onglets mobile */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-50 px-3 lg:bottom-4">
        <div className="popover-surface pointer-events-auto mx-auto max-w-3xl space-y-2 p-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <p className={`flex min-w-0 items-center gap-2 truncate text-[13px] ${step === 'saving' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
              {step === 'saving' && <RefreshCw size={13} className="shrink-0 animate-spin text-[var(--accent)]" />}
              <span className="truncate">{barHint}</span>
            </p>
            {(frontFile || backFile) && (
              <button onClick={resetCurrentPair} disabled={isBusy} className="ui-btn ui-btn-ghost ui-btn-sm shrink-0">
                <RotateCcw size={14} />
                Reset paire
              </button>
            )}
          </div>

          <button
            onClick={primaryAction.onClick}
            disabled={primaryDisabled}
            className="ui-btn ui-btn-primary ui-btn-lg h-12 w-full text-[15px]"
          >
            {isBusy ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : step === 'ready' ? (
              <Sparkles size={18} />
            ) : (
              <primaryAction.icon size={18} />
            )}
            {primaryAction.label}
          </button>

          {capturedPairs.length > 0 && (
            <div className={`grid gap-2 ${step === 'ready' ? 'sm:grid-cols-2' : ''}`}>
              {step === 'ready' && (
                <button onClick={() => handleProcessBatch(false)} disabled={isBusy} data-active className="ui-btn w-full">
                  Traiter le lot maintenant
                </button>
              )}
              <button
                onClick={() => handleProcessBatch(true)}
                disabled={isBusy || (captureMode === 'halves' && !halvesBackDone)}
                className="ui-btn w-full"
              >
                Traiter le lot et ouvrir la revue
              </button>
            </div>
          )}
        </div>
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt="Aperçu"
            className="max-h-[90vh] max-w-[95vw] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewUrl(null)}
            className="ui-btn ui-btn-icon absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)]"
            aria-label="Fermer l’aperçu"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {pendingCrop && (
        <CornerCropEditor
          file={pendingCrop.file}
          side={pendingCrop.side}
          onCancel={() => setPendingCrop(null)}
          onDone={(cropped) => {
            if (pendingCrop) applyCaptured(pendingCrop.side, cropped);
            setPendingCrop(null);
          }}
        />
      )}
    </Page>
  );
}
