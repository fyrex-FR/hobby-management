// Rognage déterministe sur la zone du cadre-guide du studio + zoom numérique.
// Aucune détection : on rogne une zone centrée fixe, identique au cadre affiché
// à l'écran (WYSIWYG). Pur canvas, aucune dépendance.

// Hauteur du cadre-guide en fraction de la hauteur (visible) de l'image.
export const GUIDE_HEIGHT_FRAC = 0.9;
// Ratio largeur/hauteur du cadre (proche d'une carte ~2.5x3.5).
export const GUIDE_ASPECT = 0.72;

export type Rect = { x: number; y: number; w: number; h: number };

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
