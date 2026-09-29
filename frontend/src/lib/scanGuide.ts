import type { Quad } from './cardQuad';

/**
 * Logique du guidage live, indépendante de la caméra (testable) : suit le
 * contour détecté image après image, mesure sa stabilité et décide quand
 * déclencher la photo automatique.
 *
 * - Stable : les coins bougent de moins de 2 % d'une image à l'autre.
 * - Déclenche après `stableFrames` images stables, une seule fois.
 * - Se réarme quand la carte quitte le cadre (3 images sans détection) ou
 *   change franchement de place (> 15 %) : retournement recto → verso,
 *   carte suivante.
 */
export interface GuideState {
  corners: Quad | null;
  /** 0 → 1 : progression vers le déclenchement automatique. */
  stable: number;
  /** Vrai à l'image où la photo automatique doit partir. */
  shoot: boolean;
}

export function createGuideTracker(opts: { stableFrames?: number; auto?: boolean } = {}) {
  const stableFrames = opts.stableFrames ?? 5;
  const auto = opts.auto ?? true;
  let prev: Quad | null = null;
  let stable = 0;
  let lost = 0;
  let armed = true;

  return function update(corners: Quad | null): GuideState {
    if (!corners) {
      lost += 1;
      if (lost >= 3) { armed = true; prev = null; stable = 0; }
      return { corners: lost >= 3 ? null : prev, stable: 0, shoot: false };
    }
    lost = 0;
    const moved = prev ? Math.max(...corners.map((p, i) => Math.hypot(p.x - prev![i].x, p.y - prev![i].y))) : 1;
    if (moved > 0.15) armed = true;
    stable = moved < 0.02 ? stable + 1 : 0;
    prev = corners;
    const shoot = auto && armed && stable >= stableFrames;
    if (shoot) { armed = false; stable = 0; }
    return { corners, stable: shoot ? 1 : Math.min(1, stable / stableFrames), shoot };
  };
}
