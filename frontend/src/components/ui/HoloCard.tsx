import { useEffect, useRef, type ReactNode } from 'react';
import type { HoloRarity } from '../../lib/holo';

/**
 * Carte holographique : bascule en 3D sous le pointeur (ou au gyroscope sur
 * mobile), reflet qui suit la lumière et film irisé dont l'intensité dépend de
 * la rareté. Tout passe par des variables CSS mises à jour hors React (pas de
 * re-render à chaque mouvement). Désactivé si l'utilisateur réduit les animations.
 *
 * Styles : .holo* dans index.css.
 */

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function HoloCard({
  children,
  rarity = 'base',
  maxTilt = 14,
  gyro = false,
  className = '',
  rounded = 'rounded-xl',
  disabled = false,
}: {
  children: ReactNode;
  rarity?: HoloRarity;
  /** Angle maximal en degrés (faible dans les grilles, fort en plein écran). */
  maxTilt?: number;
  /** Suit l'inclinaison du téléphone (vue détail uniquement : coûteux). */
  gyro?: boolean;
  className?: string;
  rounded?: string;
  /** Coupe l'effet (ex. mode édition) sans changer la mise en page. */
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || disabled || reducedMotion()) return;
    let frame = 0;
    let target = { x: 0.5, y: 0.5, active: false };

    const paint = () => {
      frame = 0;
      const { x, y, active } = target;
      const rx = (0.5 - y) * maxTilt * 2;
      const ry = (x - 0.5) * maxTilt * 2;
      root.style.setProperty('--holo-rx', `${rx.toFixed(2)}deg`);
      root.style.setProperty('--holo-ry', `${ry.toFixed(2)}deg`);
      root.style.setProperty('--holo-x', `${(x * 100).toFixed(1)}%`);
      root.style.setProperty('--holo-y', `${(y * 100).toFixed(1)}%`);
      root.style.setProperty('--holo-hyp', Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2).toFixed(3));
      root.dataset.active = active ? 'true' : 'false';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && gyro) return; // au doigt, le gyroscope prime
      const r = root.getBoundingClientRect();
      target = {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
        active: true,
      };
      schedule();
    };
    const onLeave = () => { target = { x: 0.5, y: 0.5, active: false }; schedule(); };

    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);

    // Gyroscope : bêta (avant/arrière) et gamma (gauche/droite), centrés sur la
    // position de départ pour que la carte soit droite quand on la regarde.
    let base: { b: number; g: number } | null = null;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (!base) base = { b: e.beta, g: e.gamma };
      const g = Math.max(-25, Math.min(25, e.gamma - base.g)) / 50 + 0.5;
      const b = Math.max(-25, Math.min(25, e.beta - base.b)) / 50 + 0.5;
      target = { x: g, y: b, active: true };
      schedule();
    };
    if (gyro) window.addEventListener('deviceorientation', onTilt);

    return () => {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      if (gyro) window.removeEventListener('deviceorientation', onTilt);
      if (frame) cancelAnimationFrame(frame);
      for (const v of ['--holo-rx', '--holo-ry', '--holo-x', '--holo-y', '--holo-hyp']) root.style.removeProperty(v);
      root.dataset.active = 'false';
    };
  }, [maxTilt, gyro, disabled]);

  return (
    <div ref={rootRef} className={`holo ${className}`} data-rarity={rarity} data-active="false">
      <div className={`holo-inner ${rounded}`}>
        {children}
        <div className="holo-foil" aria-hidden="true" />
        <div className="holo-sparkle" aria-hidden="true" />
        <div className="holo-glare" aria-hidden="true" />
      </div>
    </div>
  );
}
