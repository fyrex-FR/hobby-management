import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus d'une fenêtre modale faite main : Tab et Maj+Tab tournent dans la
 * fenêtre, et à la fermeture le focus revient sur l'élément qui l'a ouverte
 * (la carte cliquée), pour ne pas perdre sa place dans la grille.
 *
 * `enabled` à false quand une surcouche (plein écran, autre modale) prend la
 * main : elle gère alors son propre focus.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const root = ref.current;
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !root.contains(active);
      if (e.shiftKey && (active === first || active === root || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, ref]);
}
