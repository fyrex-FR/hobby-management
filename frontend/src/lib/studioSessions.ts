export interface StudioSessionSummary {
  id: string;
  tag: string;
  startedAt: string;
  updatedAt: string;
  processedAt: string | null;
  cardIds: string[];
  processedCardIds: string[];
  capturedCount: number;
  processedCount: number;
  errorsCount: number;
  lastError: string | null;
}

const STORAGE_KEY = 'studio_sessions_v1';

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function createStudioTag(date = new Date()) {
  return `studio_${date.getFullYear()}_${pad(date.getMonth() + 1)}_${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function loadStudioSessions(): StudioSessionSummary[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudioSessionSummary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStudioSessions(sessions: StudioSessionSummary[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function createStudioSession(): StudioSessionSummary {
  const now = new Date().toISOString();
  const session: StudioSessionSummary = {
    id: crypto.randomUUID(),
    tag: createStudioTag(new Date()),
    startedAt: now,
    updatedAt: now,
    processedAt: null,
    cardIds: [],
    processedCardIds: [],
    capturedCount: 0,
    processedCount: 0,
    errorsCount: 0,
    lastError: null,
  };

  const sessions = loadStudioSessions();
  saveStudioSessions([session, ...sessions].slice(0, 30));
  return session;
}

export function updateStudioSession(id: string, updater: (session: StudioSessionSummary) => StudioSessionSummary) {
  const sessions = loadStudioSessions();
  const next = sessions.map((session) =>
    session.id === id
      ? updater({
          ...session,
          updatedAt: new Date().toISOString(),
        })
      : session,
  );
  saveStudioSessions(next);
  return next.find((session) => session.id === id) ?? null;
}

export function getStudioSession(id: string | null | undefined) {
  if (!id) return null;
  return loadStudioSessions().find((session) => session.id === id) ?? null;
}

export function formatStudioDuration(startedAt: string, endedAt?: string | null) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt ?? Date.now()).getTime();
  const diffMs = Math.max(0, end - start);
  const totalMinutes = Math.round(diffMs / 60000);
  if (totalMinutes < 1) return '< 1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
