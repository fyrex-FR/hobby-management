import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTracker } from './salonTracker';

describe('salonTracker', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('regroupe les événements et ignore les doublons', () => {
    const sent: string[] = [];
    const t = createTracker('tok', { send: (b) => sent.push(b), delayMs: 1000 });
    t.track('visit');
    t.track('view', 'a');
    t.track('view', 'a');
    t.track('add', 'a');
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0]);
    expect(body.events).toEqual([{ kind: 'visit' }, { kind: 'view', card_id: 'a' }, { kind: 'add', card_id: 'a' }]);
    expect(body.visitor).toMatch(/^[0-9a-f]{32}$/);
  });

  it('vide la file à la demande (page masquée)', () => {
    const sent: string[] = [];
    const t = createTracker('tok', { send: (b) => sent.push(b) });
    t.track('cart');
    t.flush();
    t.flush();
    expect(sent).toHaveLength(1);
  });

  it('ne compte pas le vendeur', () => {
    const sent: string[] = [];
    const t = createTracker('tok', { send: (b) => sent.push(b), disabled: true });
    t.track('visit');
    t.flush();
    expect(sent).toHaveLength(0);
  });
});
