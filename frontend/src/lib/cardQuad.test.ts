import { describe, expect, it } from 'vitest';
import { detectQuad, type Pt, type Quad } from './cardQuad';

/** Image synthétique : fond bruité + distracteurs, carte (quadrilatère) plus claire avec un cadre imprimé. */
function scene(w: number, h: number, quad: Quad, seed = 3): Float32Array {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = new Float32Array(w * h);
  const inside = (q: Quad, x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      const z = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (sign === 0) sign = Math.sign(z);
      else if (Math.sign(z) !== sign && z !== 0) return false;
    }
    return true;
  };
  const shrink = (q: Quad, k: number): Quad => {
    const cx = (q[0].x + q[2].x) / 2, cy = (q[0].y + q[2].y) / 2;
    return q.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k })) as Quad;
  };
  const inner = shrink(quad, 0.86);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 55 + (rnd() - 0.5) * 30 + (Math.sin(y * 0.15) > 0.95 ? 25 : 0); // fond + « lattes »
      if (inside(quad, x, y)) v = inside(inner, x, y) ? 120 + (rnd() - 0.5) * 60 : 205 + (rnd() - 0.5) * 20;
      g[y * w + x] = v;
    }
  }
  return g;
}

function rotated(cx: number, cy: number, cw: number, ch: number, deg: number): Quad {
  const a = (deg * Math.PI) / 180;
  const pts = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]].map(([x, y]) => ({
    x: cx + x * Math.cos(a) - y * Math.sin(a),
    y: cy + x * Math.sin(a) + y * Math.cos(a),
  }));
  return pts as Quad;
}

function maxCornerError(found: Quad, truth: Quad): number {
  return Math.max(...found.map((p: Pt) => Math.min(...truth.map((t) => Math.hypot(p.x - t.x, p.y - t.y)))));
}

describe('detectQuad', () => {
  const W = 240, H = 320;
  for (const deg of [0, 8, 15, -12, 25]) {
    it(`retrouve une carte penchée de ${deg}°`, () => {
      const truth = rotated(W / 2, H / 2, 140, 196, deg);
      const res = detectQuad(scene(W, H, truth), W, H);
      expect(res).not.toBeNull();
      expect(maxCornerError(res!.corners, truth)).toBeLessThan(Math.max(W, H) * 0.03);
    });
  }

  it('retrouve une carte vue en perspective', () => {
    const truth: Quad = [{ x: 62, y: 58 }, { x: 186, y: 70 }, { x: 196, y: 262 }, { x: 48, y: 250 }];
    const res = detectQuad(scene(W, H, truth), W, H);
    expect(res).not.toBeNull();
    expect(maxCornerError(res!.corners, truth)).toBeLessThan(Math.max(W, H) * 0.03);
  });

  it('ne trouve rien sur un fond sans carte', () => {
    const g = new Float32Array(W * H);
    let s = 9;
    for (let i = 0; i < g.length; i++) g[i] = 60 + (((s = (s * 16807) % 2147483647) / 2147483647) - 0.5) * 30;
    expect(detectQuad(g, W, H)).toBeNull();
  });
});
