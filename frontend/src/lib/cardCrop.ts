// Détection des bords d'une carte + rognage/redressement de perspective via OpenCV.js.
// OpenCV est chargé à la demande (import dynamique) pour rester hors du bundle principal.

export type Point = { x: number; y: number };

export type CardQuad = {
  // Coins ordonnés (TL, TR, BR, BL) dans le repère de l'image NATURELLE (pleine résolution).
  corners: [Point, Point, Point, Point];
  naturalWidth: number;
  naturalHeight: number;
  // Ratio aire de la carte / aire de l'image (0..1). Sert d'indice de confiance.
  confidence: number;
};

// Taille de travail pour la détection (downscale) afin de garder l'analyse rapide.
const DETECT_MAX_DIMENSION = 1000;
const JPEG_QUALITY = 0.95;

type OpenCv = typeof import('@techstark/opencv-js');

let cvPromise: Promise<OpenCv> | null = null;

/** Charge (une seule fois) et initialise le runtime OpenCV.js. */
export function loadOpenCv(): Promise<OpenCv> {
  if (cvPromise) return cvPromise;

  cvPromise = import('@techstark/opencv-js').then((mod) => {
    const cv = ((mod as { default?: OpenCv }).default ?? mod) as OpenCv;
    return new Promise<OpenCv>((resolve) => {
      // Déjà initialisé ?
      if (typeof (cv as unknown as { Mat?: unknown }).Mat === 'function') {
        resolve(cv);
        return;
      }
      // Sinon on attend le callback d'init du runtime wasm.
      (cv as unknown as { onRuntimeInitialized: () => void }).onRuntimeInitialized = () =>
        resolve(cv);
    });
  });

  return cvPromise;
}

function loadImageElement(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function drawToCanvas(img: HTMLImageElement, maxDimension?: number): HTMLCanvasElement {
  const ratio = maxDimension
    ? Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight))
    : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * ratio));
  const height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

/** Ordonne 4 points en TL, TR, BR, BL. */
export function orderCorners(pts: Point[]): [Point, Point, Point, Point] {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x));
  const tr = byDiff[0];
  const bl = byDiff[byDiff.length - 1];
  return [tl, tr, br, bl];
}

/**
 * Détecte le plus grand quadrilatère (la carte) dans l'image.
 * Renvoie les coins dans le repère de l'image pleine résolution, ou `null` si rien de fiable.
 */
export async function detectCardQuad(file: File | Blob): Promise<CardQuad | null> {
  const cv = await loadOpenCv();
  const img = await loadImageElement(file);
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  if (!naturalWidth || !naturalHeight) return null;

  const work = drawToCanvas(img, DETECT_MAX_DIMENSION);
  const scaleBack = naturalWidth / work.width; // facteur pour repasser en pleine résolution

  const src = cv.imread(work);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);

  let best: { corners: Point[]; area: number } | null = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blurred, edges, 50, 150, 3, false);
    // Fermer les petits trous des contours
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const imageArea = work.width * work.height;
    const minArea = imageArea * 0.1; // ignore les petits contours (< 10% de l'image)

    for (let i = 0; i < contours.size(); i += 1) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt, false);
      if (area < minArea) {
        cnt.delete();
        continue;
      }

      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      let corners: Point[] | null = null;
      if (approx.rows === 4) {
        corners = [];
        for (let p = 0; p < 4; p += 1) {
          corners.push({ x: approx.data32S[p * 2], y: approx.data32S[p * 2 + 1] });
        }
      }

      if (corners && (!best || area > best.area)) {
        best = { corners, area };
      }

      approx.delete();
      cnt.delete();
    }

    // Repli : pas de quadrilatère net → boîte englobante du plus grand contour.
    if (!best) {
      let maxArea = 0;
      let maxIdx = -1;
      for (let i = 0; i < contours.size(); i += 1) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt, false);
        if (area > maxArea) {
          maxArea = area;
          maxIdx = i;
        }
        cnt.delete();
      }
      if (maxIdx >= 0 && maxArea >= minArea) {
        const cnt = contours.get(maxIdx);
        const rect = cv.boundingRect(cnt);
        cnt.delete();
        best = {
          area: rect.width * rect.height,
          corners: [
            { x: rect.x, y: rect.y },
            { x: rect.x + rect.width, y: rect.y },
            { x: rect.x + rect.width, y: rect.y + rect.height },
            { x: rect.x, y: rect.y + rect.height },
          ],
        };
      }
    }

    if (!best) return null;

    const ordered = orderCorners(best.corners);
    const scaled = ordered.map((pt) => ({
      x: Math.round(pt.x * scaleBack),
      y: Math.round(pt.y * scaleBack),
    })) as [Point, Point, Point, Point];

    return {
      corners: scaled,
      naturalWidth,
      naturalHeight,
      confidence: best.area / (work.width * work.height),
    };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Rogne et redresse l'image selon les 4 coins fournis (repère image naturelle).
 * Renvoie un nouveau File JPEG.
 */
export async function cropAndWarp(
  file: File,
  corners: [Point, Point, Point, Point],
): Promise<File> {
  const cv = await loadOpenCv();
  const img = await loadImageElement(file);
  const canvas = drawToCanvas(img); // pleine résolution

  const [tl, tr, br, bl] = corners;
  const outWidth = Math.max(1, Math.round(Math.max(distance(tl, tr), distance(bl, br))));
  const outHeight = Math.max(1, Math.round(Math.max(distance(tl, bl), distance(tr, br))));

  const src = cv.imread(canvas);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y,
    tr.x, tr.y,
    br.x, br.y,
    bl.x, bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    outWidth, 0,
    outWidth, outHeight,
    0, outHeight,
  ]);

  try {
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(outWidth, outHeight),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 255),
    );
    M.delete();

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    cv.imshow(outCanvas, dst);

    const blob = await new Promise<Blob>((resolve, reject) =>
      outCanvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Rognage impossible'))),
        'image/jpeg',
        JPEG_QUALITY,
      ),
    );

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}-crop.jpg`, { type: 'image/jpeg' });
  } finally {
    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
  }
}
