import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * « Photo vitrine » : la carte est détourée de son fond, puis posée sur un
 * fond propre (studio, stand gravé à ton pseudo, ou ton image de fond).
 * Tout se fait dans le navigateur, en canvas. Si la carte n'est pas
 * détectée, la photo entière est utilisée.
 */

export type VitrineStyle = 'studio' | 'stand' | 'backdrop';
export type VitrineTone = 'dark' | 'light';

/** Fond personnalisé (image IA), servi depuis /public. Absent tant qu'il n'est pas fourni. */
export const BACKDROP_URL: Record<VitrineTone, string> = {
  dark: '/vitrine/backdrop-dark.jpg',
  light: '/vitrine/backdrop-light.jpg',
};

export const VITRINE_STYLE_LABELS: Record<VitrineStyle, string> = {
  studio: 'Studio',
  stand: 'Stand',
  backdrop: 'Mon fond',
};

interface VitrineSettings {
  enabled: boolean;
  style: VitrineStyle;
  tone: VitrineTone;
  /** Gravé sur le stand / discret en bas des autres styles. Vide = rien. */
  signature: string;
  set: (patch: Partial<Omit<VitrineSettings, 'set'>>) => void;
}

export const useVitrine = create<VitrineSettings>()(
  persist(
    (set) => ({ enabled: true, style: 'stand', tone: 'dark', signature: '', set: (patch) => set(patch) }),
    { name: 'cv-vitrine', partialize: ({ enabled, style, tone, signature }) => ({ enabled, style, tone, signature }) },
  ),
);

const OUT_W = 1200;
const OUT_H = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image introuvable : ${src}`));
    img.src = src;
  });
}

const backdropCache = new Map<string, Promise<HTMLImageElement | null>>();
/** Image de fond si elle a été fournie (sinon null, et le style « Mon fond » est masqué). */
export function loadBackdrop(tone: VitrineTone): Promise<HTMLImageElement | null> {
  const url = BACKDROP_URL[tone];
  if (!backdropCache.has(url)) backdropCache.set(url, loadImage(url).catch(() => null));
  return backdropCache.get(url)!;
}

/** Plus longue suite d'indices où `on[i]` est vrai, en tolérant de petits trous. */
function longestRun(on: boolean[], maxGap: number): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  let last = -1;
  for (let i = 0; i <= on.length; i++) {
    if (i < on.length && on[i]) {
      if (start < 0) start = i;
      last = i;
    } else if (start >= 0 && (i === on.length || i - last > maxGap)) {
      if (!best || last - start > best[1] - best[0]) best = [start, last];
      start = -1;
    }
  }
  return best;
}

/**
 * Isole la carte : la couleur du fond est estimée sur les bords de la photo,
 * les pixels qui s'en distinguent forment la carte, et sa boîte est trouvée
 * par projection des lignes et colonnes (ignore les pieds fins d'un stand et
 * le bruit). Instantané, sans dépendance. Sans résultat plausible, la photo
 * est gardée telle quelle.
 */
export function findCardBox(img: HTMLImageElement | HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const W0 = (img as HTMLImageElement).naturalWidth || img.width;
  const H0 = (img as HTMLImageElement).naturalHeight || img.height;
  const k = 256 / Math.max(W0, H0);
  const w = Math.max(1, Math.round(W0 * k));
  const h = Math.max(1, Math.round(H0 * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  // Couleur de fond : médiane des pixels d'une bande de 4 % sur les bords.
  const m = Math.max(2, Math.round(Math.min(w, h) * 0.04));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= m && x < w - m && y >= m && y < h - m) continue;
      const i = (y * w + x) * 4;
      rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
    }
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const br = med(rs), bg = med(gs), bb = med(bs);

  const fg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    fg[i] = Math.max(Math.abs(r - br), Math.abs(g - bg), Math.abs(b - bb)) > 34 ? 1 : 0;
  }
  const cols = Array.from({ length: w }, (_, x) => {
    let n = 0;
    for (let y = 0; y < h; y++) n += fg[y * w + x];
    return n / h > 0.22;
  });
  const xr = longestRun(cols, 3);
  if (!xr) return null;
  const rows = Array.from({ length: h }, (_, y) => {
    let n = 0;
    for (let x = xr[0]; x <= xr[1]; x++) n += fg[y * w + x];
    return n / (xr[1] - xr[0] + 1) > 0.3;
  });
  const yr = longestRun(rows, 3);
  if (!yr) return null;

  const pad = 0.012;
  const bx = Math.max(0, (xr[0] / w - pad) * W0);
  const by = Math.max(0, (yr[0] / h - pad) * H0);
  const bw = Math.min(W0 - bx, ((xr[1] - xr[0] + 1) / w + pad * 2) * W0);
  const bh = Math.min(H0 - by, ((yr[1] - yr[0] + 1) / h + pad * 2) * H0);
  const areaPct = (bw * bh) / (W0 * H0);
  const ratio = bw / bh;
  // Portrait (carte ≈ 0,71, slab ≈ 0,6), ni minuscule, ni toute l'image.
  if (areaPct < 0.12 || areaPct > 0.97 || ratio < 0.45 || ratio > 0.95) return null;
  return { x: bx, y: by, w: bw, h: bh };
}

function isolateCard(img: HTMLImageElement): HTMLCanvasElement {
  const box = findCardBox(img);
  const src = box ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  const c = document.createElement('canvas');
  c.width = Math.round(src.w);
  c.height = Math.round(src.h);
  c.getContext('2d')!.drawImage(img, src.x, src.y, src.w, src.h, 0, 0, c.width, c.height);
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function paintBackground(ctx: CanvasRenderingContext2D, tone: VitrineTone) {
  const dark = tone === 'dark';
  const g = ctx.createRadialGradient(OUT_W / 2, OUT_H * 0.38, 80, OUT_W / 2, OUT_H * 0.45, OUT_H * 0.85);
  g.addColorStop(0, dark ? '#24232e' : '#ffffff');
  g.addColorStop(0.55, dark ? '#131319' : '#efeff2');
  g.addColorStop(1, dark ? '#08080b' : '#dcdce2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, OUT_W, OUT_H);
  // Sol : halo de lumière elliptique sous la carte, fondu dans le fond (pas de bande nette).
  ctx.save();
  ctx.translate(OUT_W / 2, OUT_H * 0.86);
  ctx.scale(1, 0.22);
  const f = ctx.createRadialGradient(0, 0, 0, 0, 0, OUT_W * 0.62);
  f.addColorStop(0, dark ? 'rgba(115,102,245,0.22)' : 'rgba(91,77,232,0.10)');
  f.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = f;
  ctx.fillRect(-OUT_W, -OUT_W, OUT_W * 2, OUT_W * 2);
  ctx.restore();
  // Vignettage léger en bas.
  const v = ctx.createLinearGradient(0, OUT_H * 0.7, 0, OUT_H);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.05)');
  ctx.fillStyle = v;
  ctx.fillRect(0, OUT_H * 0.7, OUT_W, OUT_H * 0.3);
}

function paintBackdrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const k = Math.max(OUT_W / img.naturalWidth, OUT_H / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);
}

/** Carte avec ombre portée, coins arrondis et reflet au sol. */
function paintCard(ctx: CanvasRenderingContext2D, card: HTMLCanvasElement, x: number, y: number, w: number, h: number, tone: VitrineTone, reflection: boolean) {
  const r = w * 0.035;
  ctx.save();
  ctx.shadowColor = tone === 'dark' ? 'rgba(0,0,0,0.65)' : 'rgba(20,20,40,0.28)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 36;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(card, x, y, w, h);
  // Liseré de lumière sur le bord supérieur.
  const edge = ctx.createLinearGradient(0, y, 0, y + h * 0.25);
  edge.addColorStop(0, 'rgba(255,255,255,0.18)');
  edge.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, h * 0.25);
  ctx.restore();

  if (!reflection) return;
  // Reflet inversé, estompé vers le bas.
  const rh = h * 0.28;
  const off = document.createElement('canvas');
  off.width = Math.round(w);
  off.height = Math.round(rh);
  const o = off.getContext('2d')!;
  o.translate(0, rh);
  o.scale(1, -1);
  o.drawImage(card, 0, card.height * (1 - rh / h), card.width, card.height * (rh / h), 0, 0, w, rh);
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalCompositeOperation = 'destination-in';
  const fade = o.createLinearGradient(0, 0, 0, rh);
  fade.addColorStop(0, `rgba(0,0,0,${tone === 'dark' ? 0.32 : 0.22})`);
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = fade;
  o.fillRect(0, 0, w, rh);
  ctx.drawImage(off, x, y + h + 6);
}

/** Plaque arrière du stand (acrylique transparent), dessinée avant la carte. */
function paintStandPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  const px = x - w * 0.06;
  const pw = w * 1.12;
  const plate = ctx.createLinearGradient(px, 0, px + pw, 0);
  plate.addColorStop(0, 'rgba(255,255,255,0.05)');
  plate.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  plate.addColorStop(1, 'rgba(255,255,255,0.04)');
  roundRect(ctx, px, y + h * 0.18, pw, h * 0.9, w * 0.04);
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** Socle du stand, dessiné après la carte : il en couvre le bas, comme si elle y était glissée. */
function paintStandBase(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone: VitrineTone, signature: string) {
  const dark = tone === 'dark';
  const bw = w * 1.34;
  const bh = h * 0.11;
  const bx = x + (w - bw) / 2;
  const by = y + h - bh * 0.35;
  ctx.save();
  ctx.shadowColor = dark ? 'rgba(0,0,0,0.7)' : 'rgba(20,20,40,0.25)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  const base = ctx.createLinearGradient(0, by, 0, by + bh);
  base.addColorStop(0, dark ? '#2b2a36' : '#ffffff');
  base.addColorStop(1, dark ? '#131219' : '#e2e2e8');
  roundRect(ctx, bx, by, bw, bh, bh * 0.22);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.restore();
  // Arête lumineuse et face avant.
  ctx.save();
  roundRect(ctx, bx, by, bw, bh, bh * 0.22);
  ctx.clip();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.9)';
  ctx.fillRect(bx, by, bw, 3);
  ctx.fillStyle = dark ? 'rgba(115,102,245,0.35)' : 'rgba(91,77,232,0.25)';
  ctx.fillRect(bx, by + bh - 4, bw, 4);
  ctx.restore();

  if (signature) {
    const size = Math.round(bh * 0.34);
    ctx.save();
    ctx.font = `600 ${size}px Geist, Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${Math.round(size * 0.18)}px`;
    const tx = bx + bw / 2;
    const ty = by + bh * 0.52;
    // Gravure : ombre claire décalée + texte en creux.
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)';
    ctx.fillText(signature.toUpperCase(), tx, ty + 2);
    ctx.fillStyle = dark ? 'rgba(220,218,255,0.78)' : 'rgba(60,55,90,0.75)';
    ctx.fillText(signature.toUpperCase(), tx, ty);
    ctx.restore();
  }
}

function paintSignature(ctx: CanvasRenderingContext2D, signature: string, tone: VitrineTone) {
  if (!signature) return;
  ctx.save();
  ctx.font = '600 30px Geist, Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '6px';
  ctx.fillStyle = tone === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(20,20,30,0.45)';
  ctx.fillText(signature.toUpperCase(), OUT_W / 2, OUT_H - 56);
  ctx.restore();
}

export interface VitrineOptions {
  style: VitrineStyle;
  tone: VitrineTone;
  signature?: string;
}

/** Compose la photo vitrine (JPEG 1200 × 1600) à partir d'une photo de carte. */
export async function makeVitrine(photo: Blob, opts: VitrineOptions): Promise<Blob> {
  const url = URL.createObjectURL(photo);
  try {
    const [img] = await Promise.all([loadImage(url), document.fonts?.load('600 40px Geist').catch(() => undefined)]);
    const card = isolateCard(img);
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d')!;

    const backdrop = opts.style === 'backdrop' ? await loadBackdrop(opts.tone) : null;
    if (backdrop) paintBackdrop(ctx, backdrop);
    else paintBackground(ctx, opts.tone);

    // Carte : 64 % de la hauteur (58 % sur stand pour laisser voir le socle).
    const maxH = OUT_H * (opts.style === 'stand' ? 0.58 : 0.64);
    const maxW = OUT_W * 0.7;
    const k = Math.min(maxH / card.height, maxW / card.width);
    const w = card.width * k;
    const h = card.height * k;
    const x = (OUT_W - w) / 2;
    const y = opts.style === 'stand' ? OUT_H * 0.14 : OUT_H * 0.13;

    const signature = opts.signature?.trim() ?? '';
    if (opts.style === 'stand') {
      paintStandPlate(ctx, x, y, w, h);
      paintCard(ctx, card, x, y, w, h, opts.tone, false);
      paintStandBase(ctx, x, y, w, h, opts.tone, signature);
    } else {
      paintCard(ctx, card, x, y, w, h, opts.tone, true);
      paintSignature(ctx, signature, opts.tone);
    }

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Composition impossible'))), 'image/jpeg', 0.9),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Applique la photo vitrine selon les réglages de l'utilisateur, au moment
 * d'enregistrer une photo. En cas d'échec, la photo d'origine est gardée.
 */
export async function applyVitrine(photo: Blob): Promise<Blob> {
  const { enabled, style, tone, signature } = useVitrine.getState();
  if (!enabled) return photo;
  try {
    return await makeVitrine(photo, { style, tone, signature });
  } catch {
    return photo;
  }
}
