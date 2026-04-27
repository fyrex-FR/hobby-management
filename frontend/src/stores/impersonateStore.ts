import { create } from 'zustand';

interface ImpersonateStore {
  impersonatedUserId: string | null;
  impersonatedEmail: string | null;
  setImpersonate: (id: string | null, email: string | null) => void;
  clearImpersonate: () => void;
}

export const useImpersonateStore = create<ImpersonateStore>((set) => ({
  impersonatedUserId: null,
  impersonatedEmail: null,
  setImpersonate: (id, email) => set({ impersonatedUserId: id, impersonatedEmail: email }),
  clearImpersonate: () => set({ impersonatedUserId: null, impersonatedEmail: null }),
}));
