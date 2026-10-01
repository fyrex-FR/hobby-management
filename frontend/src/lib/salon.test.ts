import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
import { codeFromHash, minutesLeft } from './salon';

describe('salon', () => {
  it('lit le code du QR dans le hash', () => {
    expect(codeFromHash('#/salon?c=k7m2')).toBe('K7M2');
    expect(codeFromHash('#/salon')).toBeNull();
    expect(codeFromHash('#/salon?c=ABCDE')).toBeNull();
  });
  it('compte les minutes restantes', () => {
    const now = Date.parse('2026-10-01T10:00:00Z');
    expect(minutesLeft('2026-10-01T10:30:00Z', now)).toBe(30);
    expect(minutesLeft('2026-10-01T09:59:00Z', now)).toBeLessThan(0);
  });
});
