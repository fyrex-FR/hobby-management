// Rognage déterministe sur la zone du cadre-guide du studio.
// Aucune détection : on rogne une zone centrée fixe, identique au cadre affiché
// à l'écran (WYSIWYG). Pur canvas, aucune dépendance.

// Hauteur du cadre-guide en fraction de la hauteur de l'image.
export const GUIDE_HEIGHT_FRAC = 0.9;
// Ratio largeur/hauteur du cadre (proche d'une carte ~2.5x3.5).
export const GUIDE_ASPECT = 0.72;

export type Rect = { x: number; y: number; w: number; h: number };

/** Calcule la zone du cadre-guide (centrée) pour une image w×h. */
export function guideRect(w: number, h: number): Rect {
  let ch = h * GUIDE_HEIGHT_FRAC;
  let cw = ch * GUIDE_ASPECT;
  // Si trop large (cadre portrait étroit), on borne sur la largeur.
  const maxW = w * 0.95;
  if (cw > maxW) {
    cw = maxW;
    ch = cw / GUIDE_ASPECT;
  }
  return {
    x: (w - cw) / 2,
    y: (h - ch) / 2,
    w: cw,
    h: ch,
  };
}

/** Capture l'image vidéo et la rogne sur la zone du cadre-guide. Renvoie un File JPEG. */
export async function cropVideoToGuide(
  video: HTMLVideoElement,
  side: 'front' | 'back',
): Promise<File> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('Flux caméra indisponible');

  const r = guideRect(w, h);
  const outW = Math.round(r.w);
  const outH = Math.round(r.h);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, outW, outH);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Rognage impossible'))),
      'image/jpeg',
      0.95,
    ),
  );

  return new File([blob], `${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
}
