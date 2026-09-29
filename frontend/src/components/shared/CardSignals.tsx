import type { ReactNode } from 'react';
import { getCardAlerts, getCardConfidence } from '../../lib/cardQuality';
import type { Card } from '../../types';

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md px-1.5 text-[11px] font-semibold ring-1 ring-inset"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        ['--tw-ring-color' as string]: `color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function ConfidenceBadge({ card }: { card: Partial<Card> }) {
  const confidence = getCardConfidence(card);
  const color =
    confidence.tier === 'high' ? 'var(--green)' : confidence.tier === 'medium' ? 'var(--accent)' : 'var(--red)';

  return (
    <Pill color={color}>
      <span className="tabular">IA {confidence.value}</span>
    </Pill>
  );
}

export function AlertChips({ card, limit = 3 }: { card: Partial<Card>; limit?: number }) {
  const alerts = getCardAlerts(card).slice(0, limit);
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {alerts.map((alert) => (
        <Pill
          key={alert.id}
          color={alert.severity === 'high' ? 'var(--red)' : alert.severity === 'medium' ? 'var(--accent)' : 'var(--text-secondary)'}
        >
          {alert.label}
        </Pill>
      ))}
    </div>
  );
}
