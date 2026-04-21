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
      {!compact && statusText && <span style={{ color }}>{statusText}</span>}
      {compact && status && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: color }}
        />
      )}
      {card.grading_grade && <span>{card.grading_grade}</span>}
    </span>
  );
}
