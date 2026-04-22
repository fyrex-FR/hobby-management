import { create } from 'zustand';

type ActiveView = 'dashboard' | 'collection' | 'add_card' | 'studio' | 'batch' | 'review' | 'sales' | 'compare' | 'players' | 'grading';
type ViewMode = 'grid' | 'table';

export interface DrillFilter {
  player?: string;
  team?: string;
  set_name?: string;
  year?: string;
}

interface AppStore {
  activeView: ActiveView;
  viewMode: ViewMode;
  drillFilter: DrillFilter;
  setActiveView: (view: ActiveView) => void;
  setViewMode: (mode: ViewMode) => void;
  setDrillFilter: (filter: DrillFilter) => void;
  clearDrillFilter: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeView: 'dashboard',
  viewMode: 'grid',
  drillFilter: {},
  setActiveView: (view) => set({ activeView: view }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setDrillFilter: (filter) => set({ drillFilter: filter }),
  clearDrillFilter: () => set({ drillFilter: {} }),
}));
