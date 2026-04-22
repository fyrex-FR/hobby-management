import { getCardAlerts, getCardConfidence } from '../../lib/cardQuality';
import type { Card } from '../../types';

export function ConfidenceBadge({ card }: { card: Partial<Card> }) {
  const confidence = getCardConfidence(card);
  const tone =
    confidence.tier === 'high'
      ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
      : confidence.tier === 'medium'
        ? 'bg-amber-500/15 border-amber-500/25 text-amber-300'
        : 'bg-red-500/15 border-red-500/25 text-red-300';

  return (
    <div className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${tone}`}>
      IA {confidence.value}
    </div>
  );
}

export function AlertChips({ card, limit = 3 }: { card: Partial<Card>; limit?: number }) {
  const alerts = getCardAlerts(card).slice(0, limit);
  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${
            alert.severity === 'high'
              ? 'border-red-500/25 bg-red-500/10 text-red-300'
              : alert.severity === 'medium'
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                : 'border-white/10 bg-white/5 text-white/55'
          }`}
        >
          {alert.label}
        </div>
      ))}
    </div>
  );
}
