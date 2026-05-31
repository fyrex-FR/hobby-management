import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Crop, Loader2, RotateCcw, ScanLine, X } from 'lucide-react';
import {
  cropAndWarp,
  detectCardQuad,
  orderCorners,
  type CardQuad,
  type Point,
} from '../../lib/cardCrop';

type Props = {
  file: File;
  onConfirm: (file: File) => void;
  onKeepOriginal: (file: File) => void;
  onCancel: () => void;
};

const DISPLAY_MAX_WIDTH = 520;
const DISPLAY_MAX_HEIGHT_RATIO = 0.6; // 60% de la hauteur de la fenêtre

function defaultQuad(width: number, height: number): [Point, Point, Point, Point] {
  const mx = width * 0.1;
  const my = height * 0.1;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}

export function CropReviewModal({ file, onConfirm, onKeepOriginal, onCancel }: Props) {
  const [loading, setLoading] = useState(true);
  const [detectError, setDetectError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number; scale: number } | null>(null);
  const [corners, setCorners] = useState<[Point, Point, Point, Point] | null>(null);
  const previewUrlRef = useRef<string>('');
  const dragRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // URL de prévisualisation de la photo capturée.
  const [previewUrl] = useState(() => {
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    return url;
  });

  useEffect(() => () => URL.revokeObjectURL(previewUrlRef.current), []);

  // Détection des bords au montage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const quad: CardQuad | null = await detectCardQuad(file);
        if (cancelled) return;
        const w = quad?.naturalWidth ?? 0;
        const h = quad?.naturalHeight ?? 0;
        if (quad && w && h) {
          setNatural({ w, h });
          setCorners(orderCorners(quad.corners) as [Point, Point, Point, Point]);
        } else {
          // Pas de détection fiable : on lit les dimensions via l'image et on propose un cadre par défaut.
          const img = new Image();
          img.onload = () => {
            if (cancelled) return;
            setNatural({ w: img.naturalWidth, h: img.naturalHeight });
            setCorners(defaultQuad(img.naturalWidth, img.naturalHeight));
            setDetectError('Bords non détectés — ajuste les coins manuellement.');
          };
          img.src = previewUrlRef.current;
          return;
        }
      } catch (e) {
        if (!cancelled) setDetectError((e as Error).message || 'Échec de la détection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Calcule la taille d'affichage dès qu'on connaît les dimensions naturelles.
  useEffect(() => {
    if (!natural) return;
    const maxH = window.innerHeight * DISPLAY_MAX_HEIGHT_RATIO;
    const scale = Math.min(DISPLAY_MAX_WIDTH / natural.w, maxH / natural.h, 1);
    setDisplay({ w: natural.w * scale, h: natural.h * scale, scale });
    setLoading(false);
  }, [natural]);

  const pointerToNatural = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      if (!svg || !display) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = (clientX - rect.left) / display.scale;
      const y = (clientY - rect.top) / display.scale;
      return {
        x: Math.max(0, Math.min(natural!.w, x)),
        y: Math.max(0, Math.min(natural!.h, y)),
      };
    },
    [display, natural],
  );

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = index;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragRef.current === null || !corners) return;
    const pt = pointerToNatural(e.clientX, e.clientY);
    setCorners((prev) => {
      if (!prev) return prev;
      const next = [...prev] as [Point, Point, Point, Point];
      next[dragRef.current as number] = pt;
      return next;
    });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  function resetCorners() {
    if (natural) setCorners(defaultQuad(natural.w, natural.h));
  }

  async function handleConfirm() {
    if (!corners) return;
    setProcessing(true);
    try {
      const cropped = await cropAndWarp(file, orderCorners(corners) as [Point, Point, Point, Point]);
      onConfirm(cropped);
    } catch (e) {
      setDetectError((e as Error).message || 'Rognage impossible.');
      setProcessing(false);
    }
  }

  const labels = ['HG', 'HD', 'BD', 'BG'];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="panel relative flex w-full max-w-2xl max-h-[92vh] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d0c0b] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-dim)] text-[var(--accent)]">
              <ScanLine size={20} />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-white sm:text-lg">Vérifier le rognage</h2>
              <p className="text-xs font-medium text-[var(--text-muted)]">Ajuste les coins puis valide.</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={processing}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white active:scale-90 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto p-5 sm:p-6">
          {detectError && (
            <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-300">
              {detectError}
            </div>
          )}

          {loading || !display || !corners ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-white/60">
              <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
              <div className="text-sm font-semibold">Analyse de la carte…</div>
            </div>
          ) : (
            <div className="relative" style={{ width: display.w, height: display.h }}>
              <img
                src={previewUrl}
                alt="Capture"
                className="absolute inset-0 h-full w-full select-none rounded-xl"
                draggable={false}
              />
              <svg
                ref={svgRef}
                className="absolute inset-0 touch-none"
                width={display.w}
                height={display.h}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <polygon
                  points={corners.map((c) => `${c.x * display.scale},${c.y * display.scale}`).join(' ')}
                  fill="rgba(0,0,0,0.25)"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
                {corners.map((c, i) => (
                  <g key={i}>
                    <circle
                      cx={c.x * display.scale}
                      cy={c.y * display.scale}
                      r={14}
                      fill="var(--accent)"
                      fillOpacity={0.25}
                      stroke="var(--accent)"
                      strokeWidth={2}
                      style={{ cursor: 'grab' }}
                      onPointerDown={handlePointerDown(i)}
                    />
                    <text
                      x={c.x * display.scale}
                      y={c.y * display.scale + 3}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight="bold"
                      fill="#fff"
                      pointerEvents="none"
                    >
                      {labels[i]}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-white/5 p-4 sm:flex-row sm:p-5">
          <button
            onClick={resetCorners}
            disabled={loading || processing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/75 transition-all hover:bg-white/10 disabled:opacity-40 sm:flex-none"
          >
            <RotateCcw size={15} />
            Réinitialiser
          </button>
          <button
            onClick={() => onKeepOriginal(file)}
            disabled={processing}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-white/10 disabled:opacity-40 sm:flex-1"
          >
            Garder l'original
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || processing || !corners}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-[#0d0c0b] transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:flex-1"
            style={{ background: 'var(--accent)' }}
          >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <Crop size={16} />}
            Valider le rognage
          </button>
        </div>
      </motion.div>
    </div>
  );
}
