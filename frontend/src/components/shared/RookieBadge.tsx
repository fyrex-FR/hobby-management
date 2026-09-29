/**
 * Pastille « RC » (Rookie Card). Fond sombre opaque teinté : lisible posée
 * sur une photo de carte comme sur une surface de l'app.
 */
export function RookieBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md font-semibold ring-1 ring-inset ${
        compact ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-[11px]'
      }`}
      style={{
        color: 'var(--blue)',
        background: 'color-mix(in srgb, var(--blue) 14%, var(--bg-card))',
        ['--tw-ring-color' as string]: 'color-mix(in srgb, var(--blue) 32%, transparent)',
      }}
      title="Rookie Card"
    >
      RC
    </span>
  );
}
