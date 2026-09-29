import { create } from 'zustand';

/** Ouverture de la fenêtre des réglages « Photos vitrine » depuis n'importe où. */
export const useVitrineSettingsModal = create<{ open: boolean; setOpen: (v: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
