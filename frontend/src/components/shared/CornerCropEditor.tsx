import { useEffect, useRef, useState } from 'react';
import { Check, X, Wand2, Loader2 } from 'lucide-react';
import { detectCardCorners, warpCard, defaultCorners, type Point } from '../../lib/cardScan';

type Corners = [Point, Point, Point, Point];

interface Props {
  file: File;
  side: 'front' | 'back';
  onDone: (cropped: File) => void;
  onCancel: () => void;
}

export function CornerCropEditor({ file, side, onDone, onCancel }: Props) {
  const [url] = useState(() => URL.createObjectURL(file));
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [corners, setCorners] = useState<Corners | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [warping, setWarping] = useState(false);
  const [note, setNote] = useState('');
  const dragIndex = useRef<number | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // Détection auto en arrière-plan (n'empêche jamais l'édition manuelle).
  async function runDetect(img: HTMLImageElement) {
    setAutoBusy(true);
    setNote('');
    try {
      const found = await detectCardCorners(img);
      if (found) setCorners(found);
      else setNote('Carte non détectée — ajuste les coins à la main.');
    } catch {
      setNote('Détection auto indisponible — ajuste les coins à la main.');
    } finally {
      setAutoBusy(false);
    }
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    setDims({ w, h });
    setCorners(defaultCorners(w, h)); // éditable tout de suite
    void runDetect(img);
  }

  function pointerToImage(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current;
    if (!svg || !dims) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * dims.w;
    const y = ((clientY - rect.top) / rect.height) * dims.h;
    return { x: Math.max(0, Math.min(dims.w, x)), y: Math.max(0, Math.min(dims.h, y)) };
  }

  function startDrag(i: number, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragIndex.current = i;
    const move = (ev: PointerEvent) => {
      const p = pointerToImage(ev.clientX, ev.clientY);
      if (p == null || dragIndex.current == null) return;
      setCorners((prev) => {
        if (!prev) return prev;
        const next = [...prev] as Corners;
        next[dragIndex.current!] = p;
        return next;
      });
    };
    const up = () => {
      dragIndex.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  async function validate() {
    const img = imgRef.current;
    if (!img || !corners) return;
    setWarping(true);
    try {
      const cropped = await warpCard(img, corners, side);
      onDone(cropped);
    } catch {
      setNote('Redressement impossible — réessaie.');
      setWarping(false);
    }
  }

  const handleR = dims ? Math.max(dims.w, dims.h) * 0.03 : 0;
  const poly = corners ? corners.map((c) => `${c.x},${c.y}`).join(' ') : '';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col dark-scope bg-black">
      {/* En-tête */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button onClick={onCancel} className="ui-btn ui-btn-ghost">
          <X size={16} /> Annuler
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">Ajuste les coins</p>
          <p className="text-xs text-[var(--text-muted)]">{side === 'front' ? 'Recto' : 'Verso'}</p>
        </div>
        <button
          onClick={() => imgRef.current && runDetect(imgRef.current)}
          disabled={autoBusy}
          className="ui-btn"
          title="Relancer la détection auto"
        >
          {autoBusy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Auto
        </button>
      </div>

      {/* Zone d'édition */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <div className="relative max-h-full max-w-full" style={{ aspectRatio: dims ? `${dims.w} / ${dims.h}` : undefined }}>
          <img
            ref={imgRef}
            src={url}
            onLoad={onImgLoad}
            alt=""
            className="block max-h-full max-w-full select-none object-contain"
            draggable={false}
          />
          {dims && corners && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              className="absolute inset-0 h-full w-full touch-none"
              preserveAspectRatio="none"
            >
              <polygon points={poly} fill="rgba(245,166,35,0.12)" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              {corners.map((c, i) => (
                <g key={i}>
                  <circle cx={c.x} cy={c.y} r={handleR} fill="rgba(245,166,35,0.3)" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <circle cx={c.x} cy={c.y} r={handleR * 2.4} fill="transparent" className="cursor-grab touch-none" onPointerDown={(e) => startDrag(i, e)} />
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      {/* Pied */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--border)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
        <p className="text-center text-xs text-[var(--text-muted)]">
          {note || 'Fais glisser les quatre poignées sur les coins de la carte.'}
        </p>
        <button
          onClick={validate}
          disabled={warping || !corners}
          className="ui-btn ui-btn-primary ui-btn-lg mx-auto w-full max-w-md"
        >
          {warping ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
          {warping ? 'Redressement…' : 'Valider le recadrage'}
        </button>
      </div>
    </div>
  );
}
