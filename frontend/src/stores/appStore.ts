import { create } from 'zustand';

export type ActiveView = 'dashboard' | 'collection' | 'scan' | 'add_card' | 'studio' | 'batch' | 'import_review' | 'review' | 'sales' | 'compare' | 'players' | 'grading' | 'requests' | 'migration' | 'ebay';
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
  reviewSessionId: string | null;
  importBatchId: string | null;
  setActiveView: (view: ActiveView) => void;
  setViewMode: (mode: ViewMode) => void;
  setDrillFilter: (filter: DrillFilter) => void;
  clearDrillFilter: () => void;
  setReviewSessionId: (sessionId: string | null) => void;
  setImportBatchId: (batchId: string | null) => void;
}

const VIEWS: ActiveView[] = ['dashboard', 'collection', 'scan', 'add_card', 'studio', 'batch', 'import_review', 'review', 'sales', 'compare', 'players', 'grading', 'requests', 'migration', 'ebay'];

/** Vue lue dans l'URL (#/collection) : un rafraîchissement ne renvoie plus au dashboard. */
export function viewFromHash(hash = window.location.hash): ActiveView | null {
  const m = hash.match(/^#\/([a-z_]+)/);
  return m && (VIEWS as string[]).includes(m[1]) ? (m[1] as ActiveView) : null;
}

export const useAppStore = create<AppStore>((set) => ({
  activeView: viewFromHash() ?? 'dashboard',
  viewMode: 'grid',
  drillFilter: {},
  reviewSessionId: null,
  importBatchId: null,
  setActiveView: (view) => set({ activeView: view }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setDrillFilter: (filter) => set({ drillFilter: filter }),
  clearDrillFilter: () => set({ drillFilter: {} }),
  setReviewSessionId: (sessionId) => set({ reviewSessionId: sessionId }),
  setImportBatchId: (batchId) => set({ importBatchId: batchId }),
}));
