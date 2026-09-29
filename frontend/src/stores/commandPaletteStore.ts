import { create } from 'zustand';

/** Ouverture de la palette ⌘K depuis n'importe où (bouton de la sidebar, raccourci). */
export const useCommandPalette = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
