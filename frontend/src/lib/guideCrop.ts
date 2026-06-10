// Rognage déterministe sur la zone du cadre-guide du studio + zoom numérique.
// Aucune détection : on rogne une zone centrée fixe, identique au cadre affiché
// à l'écran (WYSIWYG). Pur canvas, aucune dépendance.

// Hauteur du cadre-guide en fraction de la hauteur (visible) de l'image.
export const GUIDE_HEIGHT_FRAC = 0.9;
// Ratio largeur/hauteur du cadre (proche d'une carte ~2.5x3.5).
export const GUIDE_ASPECT = 0.72;

export type Rect = { x: number; y: number; w: number; h: number };

/** Rectangle de rognage en fractions (0..1) du cadre vidéo. */
export type NormRect = { x: number; y: number; w: number; h: number };

/**
 * Cadre par défaut (centré), dérivé du guide historique pour un flux 4/3 :
 * hauteur 90% du cadre, ratio carte ~0.72.
 */
export const DEFAULT_CROP_RECT: NormRect = (() => {
  const h = GUIDE_HEIGHT_FRAC; // 0.9
  // largeur normalisée = (ratio * hauteurPx) / largeurPx, pour un cadre 4/3
  const w = Math.min(0.95, (GUIDE_ASPECT * h) / (4 / 3));
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
})();

export function clampNormRect(r: NormRect): NormRect {
  const w = Math.min(1, Math.max(0.05, r.w));
  const h = Math.min(1, Math.max(0.05, r.h));
  const x = Math.min(1 - w, Math.max(0, r.x));
  const y = Math.min(1 - h, Math.max(0, r.y));
  return { x, y, w, h };
}

/**
 * Zone du cadre-guide (centrée) pour une image w×h, en tenant compte du zoom
 * numérique (le zoom réduit la fenêtre visible centrale d'un facteur `zoom`).
 */
export function guideRect(w: number, h: number, zoom = 1): Rect {
  const vw = w / zoom;
  const vh = h / zoom;
  let ch = vh * GUIDE_HEIGHT_FRAC;
  let cw = ch * GUIDE_ASPECT;
  const maxW = vw * 0.95;
  if (cw > maxW) {
    cw = maxW;
    ch = cw / GUIDE_ASPECT;
  }
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}

async function drawRectToFile(
  video: HTMLVideoElement,
  rect: Rect,
  side: 'front' | 'back',
): Promise<File> {
  const outW = Math.max(1, Math.round(rect.w));
  const outH = Math.max(1, Math.round(rect.h));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, outW, outH);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Capture impossible'))),
      'image/jpeg',
      0.95,
    ),
  );
  return new File([blob], `${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

/** Capture l'image vidéo et la rogne sur la zone du cadre-guide (avec zoom). */
export async function cropVideoToGuide(
  video: HTMLVideoElement,
  side: 'front' | 'back',
  zoom = 1,
): Promise<File> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Flux caméra indisponible');
  return drawRectToFile(video, guideRect(w, h, zoom), side);
}

/** Capture l'image vidéo et la rogne sur un rectangle normalisé (0..1). */
export async function cropVideoToRect(
  video: HTMLVideoElement,
  side: 'front' | 'back',
  rect: NormRect,
): Promise<File> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Flux caméra indisponible');
  const r = clampNormRect(rect);
  return drawRectToFile(video, { x: r.x * w, y: r.y * h, w: r.w * w, h: r.h * h }, side);
}

/**
 * Capture en appliquant une rotation (0/90/180/270°, sens horaire) puis en
 * rognant sur un rectangle normalisé exprimé dans l'image APRÈS rotation et
 * APRÈS zoom numérique (la vue affichée montre la fenêtre centrale 1/zoom).
 * Permet un support de scan où le téléphone est monté en travers.
 */
export async function captureRotatedCrop(
  video: HTMLVideoElement,
  side: 'front' | 'back',
  rotation: number,
  rect: NormRect | null,
  zoom = 1,
): Promise<File> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Flux caméra indisponible');

  const rot = ((rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const fw = swap ? h : w; // dims de l'image après rotation
  const fh = swap ? w : h;

  const full = document.createElement('canvas');
  full.width = fw;
  full.height = fh;
  const fctx = full.getContext('2d');
  if (!fctx) throw new Error('Canvas context indisponible');
  fctx.save();
  fctx.translate(fw / 2, fh / 2);
  fctx.rotate((rot * Math.PI) / 180);
  fctx.drawImage(video, -w / 2, -h / 2, w, h);
  fctx.restore();

  // Rectangle (dans la vue affichée) -> coords image, en tenant compte du zoom
  // central : v = 0.5 + (r - 0.5) / zoom, dimension /= zoom.
  const base = rect ? clampNormRect(rect) : { x: 0, y: 0, w: 1, h: 1 };
  const z = Math.max(1, zoom);
  const mapped = clampNormRect({
    x: 0.5 + (base.x - 0.5) / z,
    y: 0.5 + (base.y - 0.5) / z,
    w: base.w / z,
    h: base.h / z,
  });
  const cx = Math.round(mapped.x * fw);
  const cy = Math.round(mapped.y * fh);
  const cw = Math.max(1, Math.round(mapped.w * fw));
  const ch = Math.max(1, Math.round(mapped.h * fh));

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('Canvas context indisponible');
  octx.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch);

  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Capture impossible'))),
      'image/jpeg',
      0.95,
    ),
  );
  return new File([blob], `${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

/** Capture la fenêtre centrale zoomée (sans rognage guide). */
export async function captureZoomedFull(
  video: HTMLVideoElement,
  side: 'front' | 'back',
  zoom = 1,
): Promise<File> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Flux caméra indisponible');
  const cw = w / zoom;
  const ch = h / zoom;
  return drawRectToFile(video, { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch }, side);
}
