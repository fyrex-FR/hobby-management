export function RookieBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-[0.08em]"
        style={{
          background: 'linear-gradient(135deg, rgba(56,189,248,0.95), rgba(59,130,246,0.95))',
          color: '#eff6ff',
          border: '1px solid rgba(191,219,254,0.45)',
          boxShadow: '0 0 18px rgba(59,130,246,0.22)',
        }}
        title="Rookie Card"
      >
        <span className="text-[8px] leading-none">✦</span>
        RC
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] font-black tracking-[0.12em]"
      style={{
        background: 'linear-gradient(135deg, rgba(14,165,233,0.95), rgba(37,99,235,0.95))',
        color: '#eff6ff',
        border: '1px solid rgba(191,219,254,0.45)',
        boxShadow: '0 0 20px rgba(37,99,235,0.24)',
      }}
      title="Rookie Card"
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black"
        style={{ background: 'rgba(239,246,255,0.18)', border: '1px solid rgba(239,246,255,0.26)' }}>
        ✦
      </span>
      RC
    </span>
  );
}
