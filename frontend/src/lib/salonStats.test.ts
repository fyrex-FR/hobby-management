import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
import { dayRange, funnelSteps, hourly, shiftDay } from './salonStats';

describe('salonStats', () => {
  it('couvre exactement une journée locale', () => {
    const { start, end } = dayRange('2026-10-01');
    expect(new Date(start).getDate()).toBe(1);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(end).getTime() - new Date(start).getTime()).toBeGreaterThanOrEqual(23 * 3600e3);
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('calcule parts et taux de passage de l’entonnoir', () => {
    const s = funnelSteps({ visitors: 100, viewed: 80, added: 40, reserved: 20, paid: 15 });
    expect(s.map((x) => x.share)).toEqual([1, 0.8, 0.4, 0.2, 0.15]);
    expect(s[4].fromPrev).toBe(0.75);
    expect(s[0].fromPrev).toBeNull();
    expect(funnelSteps({ visitors: 0, viewed: 0, added: 0, reserved: 0, paid: 0 })[2].fromPrev).toBe(0);
  });

  it('répartit l’affluence par heure locale, trous compris', () => {
    const at = (h: number) => new Date(2026, 9, 1, h, 15).toISOString();
    const rows = hourly([at(10), at(10), at(12)], [at(12)]);
    expect(rows).toEqual([
      { hour: 10, visits: 2, sales: 0 },
      { hour: 11, visits: 0, sales: 0 },
      { hour: 12, visits: 1, sales: 1 },
    ]);
    expect(hourly([], [])).toEqual([]);
  });
});
