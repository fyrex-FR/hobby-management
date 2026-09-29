/**
 * Détection d'une carte, même penchée ou vue en perspective, sans dépendance.
 *
 * 1. Contours (Sobel) sur une image réduite en niveaux de gris.
 * 2. Transformée de Hough guidée par l'orientation du gradient : chaque
 *    pixel de contour ne vote que pour les droites proches de sa direction.
 * 3. Les droites fortes sont réparties en « quasi verticales » et « quasi
 *    horizontales » ; chaque combinaison 2 + 2 donne un quadrilatère.
 * 4. Le meilleur quadrilatère est celui dont les 4 côtés sont réellement
 *    soutenus par des contours, aux proportions d'une carte ou d'un slab.
 *
 * Fonctionne sur des tableaux bruts (testable hors navigateur).
 */

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // TL, TR, BR, BL

export interface QuadResult {
  corners: Quad;
  /** 0 à 1 : part des côtés réellement soutenue par des contours. */
  confidence: number;
}

interface Line { theta: number; rho: number; votes: number }

const THETA_STEPS = 180;
const COS = new Float32Array(THETA_STEPS);
const SIN = new Float32Array(THETA_STEPS);
for (let t = 0; t < THETA_STEPS; t++) {
  COS[t] = Math.cos((t * Math.PI) / THETA_STEPS);
  SIN[t] = Math.sin((t * Math.PI) / THETA_STEPS);
}

/** Niveaux de gris depuis des pixels RGBA. */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  return g;
}

function intersect(a: Line, b: Line): Pt | null {
  const ta = (a.theta * Math.PI) / THETA_STEPS;
  const tb = (b.theta * Math.PI) / THETA_STEPS;
  const det = Math.cos(ta) * Math.sin(tb) - Math.sin(ta) * Math.cos(tb);
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (a.rho * Math.sin(tb) - b.rho * Math.sin(ta)) / det,
    y: (b.rho * Math.cos(ta) - a.rho * Math.cos(tb)) / det,
  };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Remet 4 points dans l'ordre TL, TR, BR, BL. */
export function orderQuad(pts: Pt[]): Quad {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.x - a.y - (b.x - b.y));
  return [bySum[0], byDiff[3], bySum[3], byDiff[0]];
}

/** Aire (formule du lacet) et convexité d'un quadrilatère ordonné. */
function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i], n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (z === 0) return false;
    if (sign === 0) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

/**
 * Détecte le quadrilatère de la carte dans une image en niveaux de gris.
 * `gray` : w × h valeurs 0–255. Retourne les coins dans ces coordonnées.
 */
export function detectQuad(input: Float32Array, w: number, h: number): QuadResult | null {
  let gray = input;
  // 1. Lissage (binomial 5 points, séparable) : sur un bord penché, les
  // pixels forment un escalier et leur direction brute oscille beaucoup.
  const tmp = new Float32Array(w * h);
  const sm = new Float32Array(w * h);
  const K = [1, 4, 6, 4, 1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0, n = 0;
    for (let k = -2; k <= 2; k++) { const xx = x + k; if (xx >= 0 && xx < w) { a += gray[y * w + xx] * K[k + 2]; n += K[k + 2]; } }
    tmp[y * w + x] = a / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0, n = 0;
    for (let k = -2; k <= 2; k++) { const yy = y + k; if (yy >= 0 && yy < h) { a += tmp[yy * w + x] * K[k + 2]; n += K[k + 2]; } }
    sm[y * w + x] = a / n;
  }
  gray = sm;

  // 2. Gradients.
  const mag = new Float32Array(w * h);
  const ang = new Float32Array(w * h);
  let maxMag = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
      const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      ang[i] = Math.atan2(gy, gx);
      if (m > maxMag) maxMag = m;
    }
  }
  if (maxMag < 1) return null;

  // Seuil adaptatif : ~ les 12 % de contours les plus nets.
  const hist = new Uint32Array(64);
  for (let i = 0; i < w * h; i++) hist[Math.min(63, Math.floor((mag[i] / maxMag) * 64))]++;
  let acc = 0;
  let cut = 63;
  const target = w * h * 0.12;
  for (; cut > 0; cut--) { acc += hist[cut]; if (acc >= target) break; }
  const thr = Math.max((cut / 64) * maxMag, maxMag * 0.08);

  // 3. Hough guidé par la direction du gradient (±8°).
  const diag = Math.ceil(Math.hypot(w, h));
  const rhoN = diag * 2 + 1;
  const accum = new Float32Array(THETA_STEPS * rhoN);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < thr) continue;
      let t0 = Math.round(((ang[i] + Math.PI) % Math.PI) / Math.PI * THETA_STEPS);
      t0 %= THETA_STEPS;
      for (let dt = -8; dt <= 8; dt++) {
        const t = (t0 + dt + THETA_STEPS) % THETA_STEPS;
        const rho = Math.round(x * COS[t] + y * SIN[t]) + diag;
        accum[t * rhoN + rho] += m / maxMag;
      }
    }
  }

  // 4. Pics (suppression des non-maxima), seuil relatif à la droite la plus forte.
  let accMax = 0;
  for (let q = 0; q < accum.length; q++) if (accum[q] > accMax) accMax = accum[q];
  const minVotes = Math.max(accMax * 0.2, Math.min(w, h) * 0.05);
  const lines: Line[] = [];
  const rw = Math.max(3, Math.round(Math.min(w, h) * 0.03));
  for (let t = 0; t < THETA_STEPS; t++) {
    for (let r = 0; r < rhoN; r++) {
      const v = accum[t * rhoN + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -5; dt <= 5 && isMax; dt++) {
        const tt = (t + dt + THETA_STEPS) % THETA_STEPS;
        for (let dr = -rw; dr <= rw; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= rhoN || (dt === 0 && dr === 0)) continue;
          if (accum[tt * rhoN + rr] > v) { isMax = false; break; }
        }
      }
      if (isMax) lines.push({ theta: t, rho: r - diag, votes: v });
    }
  }
  lines.sort((a, b) => b.votes - a.votes);
  // θ proche de 0/180 : normale horizontale → droite quasi verticale.
  const tilt = (t: number) => Math.min(t, THETA_STEPS - t);
  const verticals = lines.filter((l) => tilt(l.theta) <= 35).slice(0, 10);
  const horizontals = lines.filter((l) => Math.abs(l.theta - 90) <= 35).slice(0, 10);
  if (verticals.length < 2 || horizontals.length < 2) return null;

  // 5. Évaluation des quadrilatères : soutien réel des côtés par les contours.
  const support = (a: Pt, b: Pt): number => {
    const n = Math.max(12, Math.round(dist(a, b) / 3));
    let hit = 0;
    for (let k = 0; k <= n; k++) {
      const x = Math.round(a.x + ((b.x - a.x) * k) / n);
      const y = Math.round(a.y + ((b.y - a.y) * k) / n);
      let ok = false;
      for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx > 0 && yy > 0 && xx < w - 1 && yy < h - 1 && mag[yy * w + xx] >= thr * 0.7) ok = true;
      }
      if (ok) hit++;
    }
    return hit / (n + 1);
  };

  let best: { s: number; q: Quad; conf: number } | null = null;
  const margin = Math.max(w, h) * 0.04;
  for (let i = 0; i < verticals.length; i++) for (let j = i + 1; j < verticals.length; j++) {
    const v1 = verticals[i], v2 = verticals[j];
    if (Math.abs(v1.theta - v2.theta) > 20 && Math.abs(v1.theta - v2.theta) < THETA_STEPS - 20) continue;
    for (let k = 0; k < horizontals.length; k++) for (let l = k + 1; l < horizontals.length; l++) {
      const h1 = horizontals[k], h2 = horizontals[l];
      if (Math.abs(h1.theta - h2.theta) > 20) continue;
      const pts = [intersect(v1, h1), intersect(v1, h2), intersect(v2, h1), intersect(v2, h2)];
      if (pts.some((p) => !p || p.x < -margin || p.y < -margin || p.x > w + margin || p.y > h + margin)) continue;
      const q = orderQuad(pts as Pt[]);
      if (!isConvex(q)) continue;
      const area = quadArea(q) / (w * h);
      if (area < 0.12 || area > 0.98) continue;
      const qw = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
      const qh = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
      const ratio = qw / qh;
      if (ratio < 0.5 || ratio > 0.85) continue;
      const sides = [support(q[0], q[1]), support(q[1], q[2]), support(q[2], q[3]), support(q[3], q[0])];
      const minSide = Math.min(...sides);
      if (minSide < 0.35) continue;
      const conf = sides.reduce((a, b) => a + b, 0) / 4;
      const shape = 1 - Math.min(Math.abs(ratio - 0.71), Math.abs(ratio - 0.6)) * 1.5;
      // Côtés soutenus d'abord, puis proportions, puis légère préférence pour
      // le cadre extérieur (toploader entier plutôt qu'un cadre imprimé).
      const s = conf * 2 + minSide + shape * 0.5 + area * 0.6;
      if (!best || s > best.s) best = { s, q, conf };
    }
  }
  if (!best || best.conf < 0.55) return null;
  return { corners: best.q, confidence: best.conf };
}
