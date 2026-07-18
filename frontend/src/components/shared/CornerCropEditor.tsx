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
  const [detecting, setDetecting] = useState(true);
  const [warping, setWarping] = useState(false);
  const [note, setNote] = useState('');
  const dragIndex = useRef<number | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  async function runDetect(img: HTMLImageElement) {
    setDetecting(true);
    setNote('');
    const w = img.naturalWidth, h = img.naturalHeight;
    try {
      const found = await detectCardCorners(img);
      if (found) {
        setCorners(found);
      } else {
        setCorners(defaultCorners(w, h));
        setNote('Carte non détectée — ajuste les coins à la main.');
      }
    } catch {
      setCorners(defaultCorners(w, h));
      setNote('Détection indisponible — ajuste les coins à la main.');
    } finally {
      setDetecting(false);
    }
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (!img) return;
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    void runDetect(img);
  }

  function pointerToImage(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current;
    if (!svg || !dims) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * dims.w;
    const y = ((clientY - rect.top) / rect.height) * dims.h;
    return {
      x: Math.max(0, Math.min(dims.w, x)),
      y: Math.max(0, Math.min(dims.h, y)),
    };
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
      setNote('Redressement impossible — réessaie ou ajuste les coins.');
      setWarping(false);
    }
  }

  const handleR = dims ? Math.max(dims.w, dims.h) * 0.028 : 0;
  const poly = corners ? corners.map((c) => `${c.x},${c.y}`).join(' ') : '';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)] hover:text-white">
          <X size={18} /> Annuler
        </button>
        <span className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
          Ajuste les coins — {side === 'front' ? 'recto' : 'verso'}
        </span>
        <button
          onClick={() => imgRef.current && runDetect(imgRef.current)}
          disabled={detecting}
          className="flex items-center gap-1.5 text-sm font-bold text-[var(--accent)] disabled:opacity-40"
          title="Relancer la détection auto"
        >
          <Wand2 size={16} /> Auto
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden">
        <div className="relative max-w-full max-h-full" style={{ aspectRatio: dims ? `${dims.w} / ${dims.h}` : undefined }}>
          <img
            ref={imgRef}
            src={url}
            onLoad={onImgLoad}
            alt=""
            className="block max-w-full max-h-full object-contain select-none"
            draggable={false}
          />
          {dims && corners && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              className="absolute inset-0 w-full h-full touch-none"
              preserveAspectRatio="none"
            >
              <polygon
                points={poly}
                fill="rgba(245,166,35,0.12)"
                stroke="var(--accent)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {corners.map((c, i) => (
                <g key={i}>
                  <circle cx={c.x} cy={c.y} r={handleR} fill="rgba(245,166,35,0.25)" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={handleR * 2.2}
                    fill="transparent"
                    className="cursor-grab touch-none"
                    onPointerDown={(e) => startDrag(i, e)}
                  />
                </g>
              ))}
            </svg>
          )}
          {detecting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="flex items-center gap-2 text-white text-sm font-bold">
                <Loader2 size={18} className="animate-spin" /> Détection…
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10 flex flex-col gap-2">
        {note && <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>{note}</p>}
        <button
          onClick={validate}
          disabled={detecting || warping || !corners}
          className="w-full py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          style={{ background: 'var(--accent)', color: '#09090B' }}
        >
          {warping ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
          {warping ? 'Redressement…' : 'Valider le recadrage'}
        </button>
      </div>
    </div>
  );
}
