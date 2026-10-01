import { describe, expect, it } from 'vitest';
import type { Quad } from './cardQuad';
import { createGuideTracker } from './scanGuide';

const card = (dx = 0, dy = 0): Quad => [
  { x: 0.2 + dx, y: 0.1 + dy }, { x: 0.8 + dx, y: 0.1 + dy }, { x: 0.8 + dx, y: 0.9 + dy }, { x: 0.2 + dx, y: 0.9 + dy },
];

describe('scanGuide', () => {
  it('déclenche une seule fois quand la carte reste immobile', () => {
    const update = createGuideTracker({ stableFrames: 5 });
    const shots = [card(0.1), card(0.05), ...Array.from({ length: 12 }, () => card())].map(update).filter((s) => s.shoot);
    expect(shots).toHaveLength(1);
  });

  it('ne déclenche pas tant que la carte bouge', () => {
    const update = createGuideTracker({ stableFrames: 5 });
    const states = Array.from({ length: 20 }, (_, i) => update(card(i % 2 ? 0.03 : 0)));
    expect(states.some((s) => s.shoot)).toBe(false);
  });

  it('se réarme quand la carte sort du cadre puis revient (recto → verso)', () => {
    const update = createGuideTracker({ stableFrames: 3 });
    const seq = [...Array(5).fill(card()), null, null, null, ...Array(5).fill(card())];
    expect(seq.map(update).filter((s) => s.shoot)).toHaveLength(2);
  });

  it('se réarme quand la carte change franchement de place', () => {
    const update = createGuideTracker({ stableFrames: 3 });
    const seq = [...Array(5).fill(card()), ...Array(5).fill(card(0.2, 0.05))];
    expect(seq.map(update).filter((s) => s.shoot)).toHaveLength(2);
  });

  it('ne déclenche jamais en mode manuel, mais indique la stabilité', () => {
    const update = createGuideTracker({ stableFrames: 3, auto: false });
    const states = Array.from({ length: 8 }, () => update(card()));
    expect(states.some((s) => s.shoot)).toBe(false);
    expect(states.at(-1)!.stable).toBe(1);
  });
});

describe('disarm', () => {
  it('ne redéclenche pas tant que la carte reste en place', () => {
    const q = (o = 0) => [0, 1, 2, 3].map((i) => ({ x: 0.2 + o + (i % 2) * 0.5, y: 0.2 + (i > 1 ? 0.6 : 0) })) as never;
    const update = createGuideTracker({ stableFrames: 5 });
    let shots = 0;
    for (let i = 0; i < 8; i++) if (update(q()).shoot) { shots++; update.disarm(); }
    for (let i = 0; i < 20; i++) if (update(q()).shoot) shots++;
    expect(shots).toBe(1);
    for (let i = 0; i < 3; i++) update(null);
    for (let i = 0; i < 8; i++) if (update(q()).shoot) shots++;
    expect(shots).toBe(2);
  });
});
