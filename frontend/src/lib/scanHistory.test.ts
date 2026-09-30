import { describe, expect, it, vi } from 'vitest';
vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
import { groupByDay, type ScanRow } from './scanHistory';

const row = (id: string, created_at: string, estimate_value: number | null): ScanRow =>
  ({ id, created_at, ident: {} as ScanRow['ident'], estimate_value, estimate_status: null, thumb: null, card_id: null });

describe('groupByDay', () => {
  it('regroupe par jour et totalise les estimations connues', () => {
    const g = groupByDay([row('a', '2026-09-30T12:00:00', 10), row('b', '2026-09-30T09:00:00', null), row('c', '2026-09-29T12:00:00', 5)]);
    expect(g.map((x) => [x.day, x.rows.length, x.total])).toEqual([['2026-09-30', 2, 10], ['2026-09-29', 1, 5]]);
  });
});
