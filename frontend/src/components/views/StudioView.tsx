import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Archive,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronLeft,
  ImagePlus,
  Keyboard,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { compressImage } from '../../lib/storage';
import { useCreateCard, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useIdentify } from '../../hooks/useIdentify';
import { useAppStore } from '../../stores/appStore';
import { supabase } from '../../lib/supabase';
import type { CardType } from '../../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

type CaptureSide = 'front' | 'back';
type StudioStep = 'front' | 'back' | 'ready' | 'saving';
type CapturedPair = { id: string; front: File; back: File };

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
      className={`relative overflow-hidden rounded-2xl border ${active ? 'border-[var(--accent)]/60 bg-[var(--accent-dim)]' : 'border-white/10 bg-white/[0.03]'}`}
      style={{ aspectRatio: '2/3' }}
    >
      {previewUrl ? (
        <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[var(--accent)]">
            <ImagePlus size={22} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</div>
            <div className="mt-1 text-xs text-white/40">{active ? 'Prochaine capture' : 'En attente'}</div>
          </div>
        </div>
      )}

      <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/80 backdrop-blur-xl">
        {label}
      </div>
    </div>
  );
}

export function StudioView() {
  const setActiveView = useAppStore((s) => s.setActiveView);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [capturedPairs, setCapturedPairs] = useState<CapturedPair[]>([]);
  const [step, setStep] = useState<StudioStep>('front');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraAspectRatio, setCameraAspectRatio] = useState('4 / 3');
  const [cameraResolution, setCameraResolution] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const identify = useIdentify();
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      setCameraError('');
      setCameraReady(false);

      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 4096 },
            height: { ideal: 3072 },
            aspectRatio: { ideal: 4 / 3 },
          },
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
          const width = videoRef.current.videoWidth;
          const height = videoRef.current.videoHeight;
          if (width && height) {
            setCameraAspectRatio(`${width} / ${height}`);
            setCameraResolution(`${width} × ${height}`);
          }
        }
        setCameraReady(true);
      } catch (error) {
        setCameraError((error as Error).message || 'Impossible d’accéder à la caméra');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode]);

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
  }

  async function handleCapture() {
    if (!videoRef.current) return;
    setSaveError('');
    setSaveMessage('');

    try {
      const side: CaptureSide = step === 'back' ? 'back' : 'front';
      const track = streamRef.current?.getVideoTracks()[0] ?? null;
      const file =
        (track ? await mediaTrackToFile(track, side) : null) ??
        await canvasToFile(videoRef.current, side);

      if (side === 'front') {
        setFrontFile(file);
        setStep('back');
      } else {
        setBackFile(file);
        setStep('ready');
      }
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

  function queueCurrentPair() {
    if (!frontFile || !backFile) return;
    setCapturedPairs((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, front: frontFile, back: backFile },
    ]);
    resetCurrentPair();
    setSaveMessage('Paire ajoutée au lot.');
  }

  function removePair(id: string) {
    setCapturedPairs((prev) => prev.filter((pair) => pair.id !== id));
  }

  async function uploadViaBackend(file: File, cardId: string, token: string, side: CaptureSide): Promise<string> {
    const blob = await compressImage(file);
    const form = new FormData();
    form.append('file', new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
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

  async function createDraftFromPair(pair: CapturedPair, token: string) {
    let createdCardId: string | null = null;

    try {
      const identifyResult = await identify.mutateAsync({ frontFile: pair.front, backFile: pair.back });
      const newCard = await createCard.mutateAsync({
        player: identifyResult.player || null,
        team: identifyResult.team || null,
        year: identifyResult.year || null,
        brand: identifyResult.brand || null,
        set_name: identifyResult.set || null,
        card_type: (identifyResult.card_type || null) as CardType | null,
        insert_name: identifyResult.insert || null,
        parallel_name: identifyResult.parallel || null,
        parallel_confidence: identifyResult.parallel_confidence ?? null,
        card_number: identifyResult.card_number || null,
        numbered: identifyResult.numbered || null,
        is_rookie: identifyResult.is_rookie ?? null,
        condition_notes: identifyResult.condition_notes || null,
        status: 'draft',
      });
      createdCardId = newCard.id;

      const [image_front_url, image_back_url] = await Promise.all([
        uploadViaBackend(pair.front, newCard.id, token, 'front'),
        uploadViaBackend(pair.back, newCard.id, token, 'back'),
      ]);

      await updateCard.mutateAsync({
        id: newCard.id,
        image_front_url,
        image_back_url,
      });
    } catch (error) {
      const message = (error as Error).message;
      if (createdCardId) {
        try {
          await deleteCard.mutateAsync(createdCardId);
        } catch {
          throw new Error(`Échec pendant le studio photo. La carte a peut-être été créée partiellement. Détail: ${message}`);
        }
      }
      throw error;
    }
  }

  async function handleProcessBatch(openReviewAfterSave: boolean) {
    const pairsToProcess = [
      ...capturedPairs,
      ...(frontFile && backFile ? [{ id: 'current', front: frontFile, back: backFile }] : []),
    ];
    if (pairsToProcess.length === 0) return;

    setStep('saving');
    setSaveError('');

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Non authentifié');

      for (let index = 0; index < pairsToProcess.length; index += 1) {
        setSaveMessage(`Traitement du lot ${index + 1}/${pairsToProcess.length}…`);
        await createDraftFromPair(pairsToProcess[index], token);
      }

      resetSession();
      if (openReviewAfterSave) {
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

  const primaryDisabled = !!cameraError || !cameraReady || isBusy;
  const primaryAction =
    step === 'ready'
      ? { label: 'Ajouter la paire au lot', icon: Archive, onClick: queueCurrentPair }
      : {
          label: step === 'front' ? 'Capturer le recto' : 'Capturer le verso',
          icon: Camera,
          onClick: handleCapture,
        };

  const stepLabel =
    step === 'front'
      ? '1/2 • Place le recto puis capture'
      : step === 'back'
        ? '2/2 • Retourne la carte puis capture'
        : step === 'ready'
          ? 'Paire prête • ajoute-la au lot ou reprends une photo'
          : 'Enregistrement en cours…';

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? '';
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return;
      if (isBusy) return;

      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!primaryDisabled) primaryAction.onClick();
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        resetCurrentPair();
        return;
      }

      if (event.key === 'Backspace' && capturedPairs.length > 0 && step === 'front') {
        event.preventDefault();
        removePair(capturedPairs[capturedPairs.length - 1].id);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capturedPairs, isBusy, primaryDisabled, primaryAction, step]);

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-7xl px-4 sm:px-6 py-5 sm:py-10 pb-36"
      >
        <div className="mb-4 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            <button
              onClick={() => setActiveView('collection')}
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[var(--text-muted)] transition-all hover:bg-white/10 hover:text-white active:scale-90"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">Studio photo</h2>
              <p className="text-xs sm:text-sm font-medium text-[var(--text-muted)]">
                Photos propres pour la vente, puis brouillon IA sans quitter l’app.
              </p>
            </div>
          </div>

          <button
            onClick={() => setFacingMode((value) => (value === 'environment' ? 'user' : 'environment'))}
            className="inline-flex items-center justify-center gap-2 self-start sm:self-auto rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/10"
            disabled={isBusy}
          >
            <RefreshCw size={16} />
            Changer caméra
          </button>
        </div>

        <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_380px]">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 sm:px-5 py-3 sm:py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">Capture</div>
                <div className="mt-1 text-xs sm:text-sm font-semibold text-white">{stepLabel}</div>
              </div>
              <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] sm:text-xs font-bold text-white/70">
                {facingMode === 'environment' ? 'Caméra arrière' : 'Caméra avant'}
              </div>
            </div>

            <div className="relative min-h-[46vh] sm:min-h-0 sm:aspect-[4/3] bg-[#0b0c10]">
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/10 text-red-400">
                    <CameraOff size={28} />
                  </div>
                  <div>
                    <div className="text-base font-bold text-white">Caméra indisponible</div>
                    <div className="mt-2 text-sm text-white/55">{cameraError}</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.30),transparent_20%,transparent_80%,rgba(0,0,0,0.35))]" />
                  <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-5">
                    <div
                      className="relative max-h-full max-w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-black shadow-2xl"
                      style={{ aspectRatio: cameraAspectRatio, width: '100%', height: '100%' }}
                    >
                      <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-[6%]">
                        <div className="relative aspect-[2/3] h-full max-h-full rounded-[2rem] border border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.30)]">
                          <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.18em] text-white/80 backdrop-blur-xl">
                            Cadre réel
                          </div>
                          <div className="absolute inset-3 rounded-[1.6rem] border border-dashed border-white/25" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-3 sm:bottom-5 left-1/2 flex w-[calc(100%-1.5rem)] sm:w-auto -translate-x-1/2 flex-col items-center gap-2">
                    {cameraResolution && (
                      <div className="rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-white/60 backdrop-blur-xl">
                        Flux caméra: {cameraResolution}
                      </div>
                    )}
                    {!cameraReady && (
                      <div className="rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[11px] sm:text-xs font-semibold text-white/60 backdrop-blur-xl">
                        Initialisation caméra…
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          <aside className="space-y-4 sm:space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">Paire</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    Recto / Verso {capturedPairs.length > 0 ? `• ${capturedPairs.length} en lot` : ''}
                  </div>
                </div>
                {(frontFile || backFile) && (
                  <button
                    onClick={resetCurrentPair}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] sm:text-xs font-bold text-white/75 transition-all hover:bg-white/10"
                  >
                    <RotateCcw size={14} />
                    Reset paire
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <PreviewCard label="Recto" file={frontFile} active={step === 'front'} />
                <PreviewCard label="Verso" file={backFile} active={step === 'back'} />
              </div>

              <div className="mt-3 flex gap-3">
                {frontFile && (
                  <button
                    onClick={() => recapture('front')}
                    disabled={isBusy}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs sm:text-sm font-semibold text-white/80 transition-all hover:bg-white/10"
                  >
                    Reprendre recto
                  </button>
                )}
                {backFile && (
                  <button
                    onClick={() => recapture('back')}
                    disabled={isBusy}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs sm:text-sm font-semibold text-white/80 transition-all hover:bg-white/10"
                  >
                    Reprendre verso
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">Actions</div>
                <div className="mt-1 text-xs sm:text-sm font-semibold text-white">
                  Le bouton principal capture. `Space` / `Enter` marchent aussi avec une télécommande Bluetooth.
                </div>
              </div>

              <button
                onClick={() => handleProcessBatch(false)}
                disabled={(capturedPairs.length === 0 && !(frontFile && backFile)) || isBusy}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-4 py-3.5 text-sm font-bold text-[var(--accent)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy && step === 'saving' ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                Traiter le lot
              </button>

              <button
                onClick={() => handleProcessBatch(true)}
                disabled={(capturedPairs.length === 0 && !(frontFile && backFile)) || isBusy}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-bold text-white transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Traiter le lot et ouvrir la revue
              </button>

              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs sm:text-sm text-white/70">
                <div className="mb-2 flex items-center gap-2 font-semibold text-white">
                  <Keyboard size={15} className="text-[var(--accent)]" />
                  Commandes rapides
                </div>
                <div>`Space` / `Enter` = action principale</div>
                <div>`R` = reset paire en cours</div>
                <div>`Backspace` = supprimer la dernière paire du lot</div>
              </div>

              {capturedPairs.length > 0 && (
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">Lot capturé</div>
                  <div className="max-h-64 space-y-2 overflow-auto pr-1">
                    {capturedPairs.map((pair, index) => (
                      <div
                        key={pair.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">Paire {index + 1}</div>
                          <div className="truncate text-xs text-white/45">
                            {pair.front.name} • {pair.back.name}
                          </div>
                        </div>
                        <button
                          onClick={() => removePair(pair.id)}
                          disabled={isBusy}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition-all hover:bg-red-500/15"
                        >
                          <Trash2 size={14} />
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {saveMessage && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs sm:text-sm text-emerald-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 size={16} />
                    {saveMessage}
                  </div>
                </div>
              )}

              {saveError && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs sm:text-sm text-red-300">
                  {saveError}
                </div>
              )}
            </div>
          </aside>
        </div>
      </motion.div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-[1.75rem] border border-white/10 bg-black/65 p-3 shadow-2xl backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between gap-3 px-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">Action principale</div>
              <div className="truncate text-xs sm:text-sm font-semibold text-white">{stepLabel}</div>
            </div>
            {(frontFile || backFile) && (
              <button
                onClick={resetCurrentPair}
                disabled={isBusy}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] sm:text-xs font-bold text-white/75 transition-all hover:bg-white/10"
              >
                <RotateCcw size={14} />
                Reset paire
              </button>
            )}
          </div>

          <button
            onClick={primaryAction.onClick}
            disabled={primaryDisabled}
            className="flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-4 text-base font-black text-[#0d0c0b] transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
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

          {step === 'ready' && (
            <button
              onClick={() => handleProcessBatch(false)}
              disabled={isBusy}
              className="mt-3 w-full rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-4 py-3 text-sm font-bold text-[var(--accent)] transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Traiter le lot maintenant
            </button>
          )}

          {(capturedPairs.length > 0 || (frontFile && backFile)) && (
            <button
              onClick={() => handleProcessBatch(true)}
              disabled={isBusy}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Traiter le lot et ouvrir la revue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
