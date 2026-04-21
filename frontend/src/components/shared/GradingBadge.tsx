import type { Card, GradingStatus } from '../../types';

const STATUS_SHORT: Record<GradingStatus, string> = {
  submitted: 'Envoyee',
  received: 'Recue',
  graded: 'Notee',
  returned: 'Retour',
};

const STATUS_COLOR: Record<GradingStatus, string> = {
  submitted: '#f5af23',
  received: '#60a5fa',
  graded: '#34d399',
  returned: '#a1a1aa',
};

function StatusIcon({
  status,
  color,
  compact,
}: {
  status: GradingStatus;
  color: string;
  compact: boolean;
}) {
  const size = compact ? 14 : 16;
  const strokeWidth = compact ? 1.8 : 1.7;

  return (
    <span
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `${color}1f`,
        color,
      }}
    >
      <svg
        width={compact ? 10 : 11}
        height={compact ? 10 : 11}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
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
        {status === 'graded' && (
          <>
            <path d="M3.5 8.5l2.5 2.5 6-6" />
          </>
        )}
        {status === 'returned' && (
          <>
            <path d="M12.5 8A4.5 4.5 0 1 1 8 3.5" />
            <path d="M8 1.75v3.5" />
            <path d="M6.25 3.5L8 1.75 9.75 3.5" />
          </>
        )}
      </svg>
    </span>
  );
}

export function GradingBadge({
  card,
  compact = false,
}: {
  card: Pick<Card, 'grading_company' | 'grading_status' | 'grading_grade'>;
  compact?: boolean;
}) {
  if (!card.grading_company) return null;

  const status = card.grading_status;
  const color = status ? STATUS_COLOR[status] : '#f5af23';
  const statusText = status ? STATUS_SHORT[status] : null;
  const isPsa = card.grading_company === 'PSA';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-bold shrink-0 ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'}`}
      style={{
        background: 'rgba(15,23,42,0.88)',
        color: '#f8fafc',
        border: `1px solid ${color}55`,
        boxShadow: `0 0 14px ${color}22`,
      }}
      title={
        card.grading_grade
          ? `${card.grading_company} ${statusText ?? ''} ${card.grading_grade}`.trim()
          : `${card.grading_company}${statusText ? ` - ${statusText}` : ''}`
      }
    >
      {isPsa ? (
        <img
          src="/psa-logo.png"
          alt="PSA"
          className={compact ? 'h-3 w-auto object-contain' : 'h-3.5 w-auto object-contain'}
        />
      ) : (
        <span
          className="inline-flex items-center justify-center rounded-sm text-[8px] font-black leading-none"
          style={{
            minWidth: compact ? '18px' : '22px',
            height: compact ? '14px' : '16px',
            background: `linear-gradient(135deg, ${color} 0%, #ffffff 220%)`,
            color: '#0f172a',
          }}
        >
          {card.grading_company}
        </span>
      )}
      {status && <StatusIcon status={status} color={color} compact={compact} />}
      {!compact && statusText && <span style={{ color }}>{statusText}</span>}
      {card.grading_grade && <span>{card.grading_grade}</span>}
    </span>
  );
}
