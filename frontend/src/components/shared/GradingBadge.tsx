import type { Card, GradingStatus } from '../../types';

const STATUS_SHORT: Record<GradingStatus, string> = {
  submitted: 'Envoyée',
  received: 'Reçue',
  graded: 'Notée',
  returned: 'Retour',
};

const STATUS_COLOR: Record<GradingStatus, string> = {
  submitted: 'var(--accent)',
  received: 'var(--blue)',
  graded: 'var(--green)',
  returned: 'var(--text-secondary)',
};

function StatusIcon({ status, compact }: { status: GradingStatus; compact: boolean }) {
  const size = compact ? 10 : 11;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {status === 'submitted' && (
        <>
          <path d="M8 13V4" />
          <path d="M4.5 7.5L8 4l3.5 3.5" />
          <path d="M3.5 13h9" />
        </>
      )}
      {status === 'received' && (
        <>
          <path d="M3.5 5.5h9v6h-9z" />
          <path d="M3.5 7.5L8 10.5l4.5-3" />
        </>
      )}
      {status === 'graded' && <path d="M3.5 8.5l2.5 2.5 6-6" />}
      {status === 'returned' && (
        <>
          <path d="M12.5 8A4.5 4.5 0 1 1 8 3.5" />
          <path d="M8 1.75v3.5" />
          <path d="M6.25 3.5L8 1.75 9.75 3.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Pastille de gradation (société + statut + note). Fond sombre opaque teinté
 * par le statut : lisible posée sur une photo comme sur une surface.
 */
export function GradingBadge({
  card,
  compact = false,
}: {
  card: Pick<Card, 'grading_company' | 'grading_status' | 'grading_grade'>;
  compact?: boolean;
}) {
  if (!card.grading_company) return null;

  const status = card.grading_status;
  const color = status ? STATUS_COLOR[status] : 'var(--accent)';
  const statusText = status ? STATUS_SHORT[status] : null;
  const isPsa = card.grading_company === 'PSA';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-semibold ring-1 ring-inset ${
        compact ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-[11px]'
      }`}
      style={{
        color: 'var(--text-primary)',
        background: `color-mix(in srgb, ${color} 12%, var(--bg-card))`,
        ['--tw-ring-color' as string]: `color-mix(in srgb, ${color} 30%, transparent)`,
      }}
      title={
        card.grading_grade
          ? `${card.grading_company} ${statusText ?? ''} ${card.grading_grade}`.trim()
          : `${card.grading_company}${statusText ? ` - ${statusText}` : ''}`
      }
    >
      {isPsa ? (
        <img src="/psa-logo.png" alt="PSA" className={`${compact ? 'h-2.5' : 'h-3'} w-auto object-contain`} />
      ) : (
        <span>{card.grading_company}</span>
      )}
      {status && (
        <span className="inline-flex items-center gap-0.5" style={{ color }}>
          <StatusIcon status={status} compact={compact} />
          {!compact && statusText && <span className="font-medium">{statusText}</span>}
        </span>
      )}
      {card.grading_grade && <span className="tabular">{card.grading_grade}</span>}
    </span>
  );
}
