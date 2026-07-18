// Détection des coins d'une carte + redressement en perspective, via OpenCV.js
// chargé à la demande (aucun poids ajouté tant que le mode Auto n'est pas utilisé).

export type Point = { x: number; y: number };

// Ratio d'une carte standard (2.5" × 3.5").
const CARD_RATIO = 2.5 / 3.5;

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

let cvPromise: Promise<any> | null = null;

/** Charge OpenCV.js une seule fois et résout avec l'objet `cv` prêt. */
export function loadOpenCV(): Promise<any> {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const w = window as any;
    const ready = (cv: any) => {
      if (cv && cv.Mat) resolve(cv);
      else if (cv) cv.onRuntimeInitialized = () => resolve(cv);
      else reject(new Error('OpenCV indisponible'));
    };
    if (w.cv && w.cv.Mat) return resolve(w.cv);
    const existing = document.getElementById('opencv-js') as HTMLScriptElement | null;
    if (existing) {
      if (w.cv) ready(w.cv);
      else existing.addEventListener('load', () => ready(w.cv));
      return;
    }
    const script = document.createElement('script');
    script.id = 'opencv-js';
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = () => ready((window as any).cv);
    script.onerror = () => { cvPromise = null; reject(new Error('Chargement OpenCV échoué')); };
    document.body.appendChild(script);
  });
  return cvPromise;
}

/** Ordonne 4 points en TL, TR, BR, BL. */
export function orderCorners(pts: Point[]): [Point, Point, Point, Point] {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.x - a.y - (b.x - b.y));
  const tl = bySum[0];
  const br = bySum[3];
  const bl = byDiff[0];
  const tr = byDiff[3];
  return [tl, tr, br, bl];
}

/**
 * Détecte le plus grand quadrilatère (la carte) dans l'image.
 * Retourne 4 coins ordonnés TL,TR,BR,BL en coordonnées de l'image source,
 * ou null si rien de convaincant.
 */
export async function detectCardCorners(
  source: HTMLImageElement | HTMLCanvasElement,
): Promise<[Point, Point, Point, Point] | null> {
  const cv = await loadOpenCV();
  const srcW = (source as any).naturalWidth || (source as any).width;
  const srcH = (source as any).naturalHeight || (source as any).height;
  if (!srcW || !srcH) return null;

  // Downscale pour la rapidité, on remet les coins à l'échelle ensuite.
  const maxDim = 900;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const work = document.createElement('canvas');
  work.width = Math.round(srcW * scale);
  work.height = Math.round(srcH * scale);
  work.getContext('2d')!.drawImage(source, 0, 0, work.width, work.height);

  const src = cv.imread(work);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  let best: [Point, Point, Point, Point] | null = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 50, 150);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = work.width * work.height;
    let bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const area = Math.abs(cv.contourArea(approx));
        // La carte doit occuper une part significative du cadre.
        if (area > bestArea && area > imgArea * 0.15) {
          const pts: Point[] = [];
          for (let r = 0; r < 4; r++) {
            pts.push({ x: approx.intPtr(r, 0)[0] / scale, y: approx.intPtr(r, 0)[1] / scale });
          }
          bestArea = area;
          best = orderCorners(pts);
        }
      }
      approx.delete();
      cnt.delete();
    }
  } finally {
    src.delete(); gray.delete(); blur.delete(); edges.delete();
    contours.delete(); hierarchy.delete(); kernel.delete();
  }
  return best;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Redresse la carte définie par 4 coins (ordre TL,TR,BR,BL) en un rectangle
 * droit au ratio carte, et renvoie un JPEG.
 */
export async function warpCard(
  source: HTMLImageElement | HTMLCanvasElement,
  corners: [Point, Point, Point, Point],
  side: 'front' | 'back',
): Promise<File> {
  const cv = await loadOpenCV();
  const [tl, tr, br, bl] = corners;

  // Dimensions de sortie : on part de la taille moyenne détectée, en imposant
  // le ratio d'une carte pour un rendu droit et propre.
  const widthPx = (dist(tl, tr) + dist(bl, br)) / 2;
  const heightPx = (dist(tl, bl) + dist(tr, br)) / 2;
  let outW = Math.round(Math.max(widthPx, heightPx * CARD_RATIO));
  let outH = Math.round(outW / CARD_RATIO);
  outW = Math.min(1600, Math.max(400, outW));
  outH = Math.round(outW / CARD_RATIO);

  const src = cv.imread(source);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    cv.imshow(out, dst);
  } finally {
    src.delete(); dst.delete(); srcTri.delete(); dstTri.delete(); M.delete();
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob((v) => (v ? resolve(v) : reject(new Error('Redressement impossible'))), 'image/jpeg', 0.95),
  );
  return new File([blob], `${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

/** Coins par défaut (rectangle centré) quand la détection échoue. */
export function defaultCorners(w: number, h: number): [Point, Point, Point, Point] {
  const mx = w * 0.15;
  const my = h * 0.1;
  return [
    { x: mx, y: my },
    { x: w - mx, y: my },
    { x: w - mx, y: h - my },
    { x: mx, y: h - my },
  ];
}
