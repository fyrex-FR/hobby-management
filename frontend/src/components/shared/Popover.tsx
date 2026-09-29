import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/**
 * Popover ancré sur un déclencheur, rendu dans un portal en position fixe :
 * il n'est jamais rogné par un conteneur `overflow` (barre de filtres qui
 * défile horizontalement sur mobile). Se ferme au clic extérieur et à Échap.
 */
export function Popover({
  anchorRef,
  open,
  onClose,
  children,
  width = 280,
  align = 'start',
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: 'start' | 'end';
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(width, vw - 16);
      let left = align === 'end' ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      const spaceBelow = vh - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const below = spaceBelow >= 240 || spaceBelow >= spaceAbove;
      const maxHeight = Math.min(420, below ? spaceBelow : spaceAbove);
      const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - maxHeight);
      setPos({ top, left, maxHeight, width: w });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, width, align]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
      className="popover-surface z-[90] flex flex-col overflow-hidden"
    >
      {children}
    </div>,
    document.body,
  );
}
