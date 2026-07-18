// Détection des coins d'une carte (OpenCV.js, best-effort) + redressement en
// perspective (canvas pur, sans dépendance — marche toujours).

export type Point = { x: number; y: number };

// Ratio d'une carte standard (2.5" × 3.5").
export const CARD_RATIO = 2.5 / 3.5;

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';
const LOAD_TIMEOUT_MS = 12000;

let cvPromise: Promise<any> | null = null;

/** Charge OpenCV.js une seule fois. Gère le cas où `cv` est une Promise
 *  (builds récents) et échoue proprement après un délai. */
export function loadOpenCV(): Promise<any> {
  if (cvPromise) return cvPromise;
  cvPromise = new Promise((resolve, reject) => {
    const w = window as any;
    let settled = false;
    const done = (cv: any) => { if (!settled) { settled = true; resolve(cv); } };
    const fail = (e: Error) => { if (!settled) { settled = true; cvPromise = null; reject(e); } };
    const timer = setTimeout(() => fail(new Error('OpenCV: délai dépassé')), LOAD_TIMEOUT_MS);

    const ready = async (raw: any) => {
      try {
        let cv = raw;
        if (cv && typeof cv.then === 'function') cv = await cv; // build exposant une Promise
        w.cv = cv;
        if (cv && cv.Mat) { clearTimeout(timer); done(cv); }
        else if (cv) { cv.onRuntimeInitialized = () => { clearTimeout(timer); done(cv); }; }
        else fail(new Error('OpenCV indisponible'));
      } catch (e) { fail(e as Error); }
    };

    if (w.cv && (w.cv.Mat || typeof w.cv.then === 'function')) return void ready(w.cv);
    const existing = document.getElementById('opencv-js') as HTMLScriptElement | null;
    if (existing) { existing.addEventListener('load', () => ready(w.cv)); return; }

    const script = document.createElement('script');
    script.id = 'opencv-js';
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = () => ready((window as any).cv);
    script.onerror = () => fail(new Error('Chargement OpenCV échoué'));
    document.body.appendChild(script);
  });
  return cvPromise;
}

/** Ordonne 4 points en TL, TR, BR, BL. */
export function orderCorners(pts: Point[]): [Point, Point, Point, Point] {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.x - a.y - (b.x - b.y));
  return [bySum[0], byDiff[3], bySum[3], byDiff[0]];
}

/** Détecte le plus grand quadrilatère (la carte). Retourne 4 coins TL,TR,BR,BL
 *  en coords image source, ou null. Nécessite OpenCV (sinon lève). */
export async function detectCardCorners(
  source: HTMLImageElement | HTMLCanvasElement,
): Promise<[Point, Point, Point, Point] | null> {
  const cv = await loadOpenCV();
  const srcW = (source as any).naturalWidth || (source as any).width;
  const srcH = (source as any).naturalHeight || (source as any).height;
  if (!srcW || !srcH) return null;

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
        if (area > bestArea && area > imgArea * 0.15) {
          const pts: Point[] = [];
          for (let r = 0; r < 4; r++) pts.push({ x: approx.intPtr(r, 0)[0] / scale, y: approx.intPtr(r, 0)[1] / scale });
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

function dist(a: Point, b: Point): number { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Résout l'homographie 3×3 (comme getPerspectiveTransform) mappant `from`→`to`. */
function getPerspectiveTransform(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = from[i];
    const { x: dx, y: dy } = to[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]); b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]); b.push(dy);
  }
  const h = solveLinear(A, b); // 8 inconnues
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Élimination de Gauss pour un système n×n. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** Redresse la carte définie par 4 coins (TL,TR,BR,BL) en un rectangle droit
 *  au ratio carte. 100% canvas, aucune dépendance externe. */
export async function warpCard(
  source: HTMLImageElement | HTMLCanvasElement,
  corners: [Point, Point, Point, Point],
  side: 'front' | 'back',
): Promise<File> {
  const [tl, tr, br, bl] = corners;
  const widthPx = (dist(tl, tr) + dist(bl, br)) / 2;
  const heightPx = (dist(tl, bl) + dist(tr, br)) / 2;
  let outW = Math.round(Math.max(widthPx, heightPx * CARD_RATIO));
  outW = Math.min(1400, Math.max(400, outW));
  const outH = Math.round(outW / CARD_RATIO);

  const srcW = (source as any).naturalWidth || (source as any).width;
  const srcH = (source as any).naturalHeight || (source as any).height;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const sctx = srcCanvas.getContext('2d')!;
  sctx.drawImage(source, 0, 0, srcW, srcH);
  const srcData = sctx.getImageData(0, 0, srcW, srcH).data;

  // H mappe le rectangle destination -> quadrilatère source (inverse mapping).
  const destCorners = [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }];
  const H = getPerspectiveTransform(destCorners, [tl, tr, br, bl]);

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d')!;
  const dst = octx.createImageData(outW, outH);
  const dd = dst.data;

  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const X = H[0] * u + H[1] * v + H[2];
      const Y = H[3] * u + H[4] * v + H[5];
      const W = H[6] * u + H[7] * v + H[8];
      const sx = (X / W) | 0;
      const sy = (Y / W) | 0;
      const di = (v * outW + u) * 4;
      if (sx >= 0 && sx < srcW && sy >= 0 && sy < srcH) {
        const si = (sy * srcW + sx) * 4;
        dd[di] = srcData[si];
        dd[di + 1] = srcData[si + 1];
        dd[di + 2] = srcData[si + 2];
        dd[di + 3] = 255;
      } else {
        dd[di + 3] = 255;
      }
    }
  }
  octx.putImageData(dst, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('Redressement impossible'))), 'image/jpeg', 0.95),
  );
  return new File([blob], `${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

/** Coins par défaut (rectangle centré au ratio carte) si la détection échoue. */
export function defaultCorners(w: number, h: number): [Point, Point, Point, Point] {
  let cw = w * 0.7;
  let ch = cw / CARD_RATIO;
  if (ch > h * 0.9) { ch = h * 0.9; cw = ch * CARD_RATIO; }
  const x = (w - cw) / 2;
  const y = (h - ch) / 2;
  return [
    { x, y },
    { x: x + cw, y },
    { x: x + cw, y: y + ch },
    { x, y: y + ch },
  ];
}
