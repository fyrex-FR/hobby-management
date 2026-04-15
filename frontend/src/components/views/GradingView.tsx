import { useState, useMemo } from 'react';
import { useCards, useUpdateCard } from '../../hooks/useCards';
import type { Card, GradingCompany, GradingStatus } from '../../types';
import { CardDetail } from '../shared/CardDetail';

const GRADING_COMPANIES: GradingCompany[] = ['PSA', 'BGS', 'SGC', 'CGC', 'HGA'];

const STATUS_CONFIG: Record<GradingStatus, { label: string; color: string; bg: string }> = {
  submitted: { label: 'Envoyée', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  received: { label: 'Reçue par le grader', color: 'var(--accent)', bg: 'rgba(245,166,35,0.12)' },
  graded: { label: 'Notée', color: 'rgb(16,185,129)', bg: 'rgba(16,185,129,0.12)' },
  returned: { label: 'Retournée', color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
};

const GRADE_COLOR: Record<string, string> = {
  '10': 'rgb(16,185,129)',
  '9.5': 'rgb(16,185,129)',
  '9': '#6366f1',
  '8.5': '#8b5cf6',
  '8': 'var(--accent)',
  '7.5': 'var(--accent)',
  '7': 'var(--text-secondary)',
};

function gradeColor(grade: string | null): string {
  if (!grade) return 'var(--text-muted)';
  return GRADE_COLOR[grade] ?? 'var(--text-secondary)';
}

function StatusBadge({ status }: { status: GradingStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function GradingRow({
  card,
  onEdit,
  onOpenCard,
}: {
  card: Card;
  onEdit: (card: Card) => void;
  onOpenCard: (card: Card) => void;
}) {
  const days = daysSince(card.grading_submitted_at);

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 rounded-xl transition-colors"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      {/* Image */}
      <div
        className="shrink-0 cursor-pointer"
        onClick={() => onOpenCard(card)}
      >
        {card.image_front_url ? (
          <img src={card.image_front_url} alt="" className="h-14 w-auto rounded-lg object-contain hover:opacity-80 transition-opacity" />
        ) : (
          <div className="h-14 w-10 rounded-lg flex items-center justify-center text-lg" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
          {card.player ?? '—'}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {[card.year, card.brand, card.set_name, card.numbered].filter(Boolean).join(' · ')}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {card.grading_status && <StatusBadge status={card.grading_status} />}
          {card.grading_company && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {card.grading_company}
            </span>
          )}
          {card.grading_cert && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              #{card.grading_cert}
            </span>
          )}
          {days != null && !card.grading_returned_at && (
            <span className="text-[10px]" style={{ color: days > 60 ? 'var(--red)' : 'var(--text-muted)' }}>
              {days}j
            </span>
          )}
        </div>
      </div>

      {/* Grade */}
      {card.grading_grade && (
        <div className="shrink-0 text-center">
          <div className="text-2xl font-black" style={{ color: gradeColor(card.grading_grade) }}>
            {card.grading_grade}
          </div>
          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>GRADE</div>
        </div>
      )}

      {/* Edit */}
      <button
        onClick={() => onEdit(card)}
        className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      >
        ✏
      </button>
    </div>
  );
}

function GradingModal({
  card,
  onClose,
}: {
  card: Card;
  onClose: () => void;
}) {
  const updateCard = useUpdateCard();
  const [form, setForm] = useState({
    grading_company: card.grading_company ?? '',
    grading_status: card.grading_status ?? 'submitted',
    grading_submitted_at: card.grading_submitted_at?.slice(0, 10) ?? '',
    grading_returned_at: card.grading_returned_at?.slice(0, 10) ?? '',
    grading_grade: card.grading_grade ?? '',
    grading_cert: card.grading_cert ?? '',
    grading_cost: card.grading_cost?.toString() ?? '',
  });
  const [saving, setSaving] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    await updateCard.mutateAsync({
      id: card.id,
      grading_company: (form.grading_company || null) as GradingCompany | null,
      grading_status: (form.grading_status || null) as GradingStatus | null,
      grading_submitted_at: form.grading_submitted_at || null,
      grading_returned_at: form.grading_returned_at || null,
      grading_grade: form.grading_grade || null,
      grading_cert: form.grading_cert || null,
      grading_cost: form.grading_cost ? parseFloat(form.grading_cost) : null,
      status: 'collection',
    });
    setSaving(false);
    onClose();
  }

  const inputCls = 'w-full rounded-lg px-2.5 py-1.5 text-sm outline-none transition-all';
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md overflow-hidden"
        style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Grading</h3>
            <p className="text-xs mt-0.5 truncate max-w-[260px]" style={{ color: 'var(--text-muted)' }}>
              {card.player} — {card.year} {card.set_name}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="p-5 grid grid-cols-2 gap-3">
          {/* Company */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Société</label>
            <select className={inputCls} style={inputStyle} value={form.grading_company} onChange={(e) => set('grading_company', e.target.value)}>
              <option value="">—</option>
              {GRADING_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Statut</label>
            <select className={inputCls} style={inputStyle} value={form.grading_status} onChange={(e) => set('grading_status', e.target.value)}>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>

          {/* Date envoi */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Date d'envoi</label>
            <input type="date" className={inputCls} style={inputStyle} value={form.grading_submitted_at} onChange={(e) => set('grading_submitted_at', e.target.value)} />
          </div>

          {/* Date retour */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Date de retour</label>
            <input type="date" className={inputCls} style={inputStyle} value={form.grading_returned_at} onChange={(e) => set('grading_returned_at', e.target.value)} />
          </div>

          {/* Grade */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Note obtenue</label>
            <input
              className={inputCls} style={{ ...inputStyle, color: gradeColor(form.grading_grade), fontWeight: 700, fontSize: '1rem' }}
              placeholder="ex: 9.5"
              value={form.grading_grade}
              onChange={(e) => set('grading_grade', e.target.value)}
            />
          </div>

          {/* Cert */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>N° certificat</label>
            <input className={inputCls} style={inputStyle} placeholder="ex: 12345678" value={form.grading_cert} onChange={(e) => set('grading_cert', e.target.value)} />
          </div>

          {/* Cost */}
          <div className="col-span-2">
            <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Coût du grading (€)</label>
            <input type="number" className={inputCls} style={inputStyle} placeholder="0" value={form.grading_cost} onChange={(e) => set('grading_cost', e.target.value)} />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="col-span-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'var(--accent)', color: '#0E0E11', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GradingView() {
  const { data: cards = [], isLoading } = useCards();
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [statusFilter, setStatusFilter] = useState<GradingStatus | 'all'>('all');

  // Cartes en grading = celles qui ont un grading_status OU grading_company
  const gradingCards = useMemo(
    () => cards.filter((c) => c.grading_status || c.grading_company),
    [cards],
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return gradingCards;
    return gradingCards.filter((c) => c.grading_status === statusFilter);
  }, [gradingCards, statusFilter]);

  // Comptes par statut
  const counts = useMemo(() => {
    const r: Record<string, number> = { all: gradingCards.length };
    gradingCards.forEach((c) => {
      if (c.grading_status) r[c.grading_status] = (r[c.grading_status] ?? 0) + 1;
    });
    return r;
  }, [gradingCards]);

  // Stats financières
  const stats = useMemo(() => {
    const totalCost = gradingCards.reduce((s, c) => s + (c.grading_cost ?? 0), 0);
    const graded = gradingCards.filter((c) => c.grading_status === 'graded' || c.grading_status === 'returned');
    const avgGrade = graded.length > 0
      ? graded.reduce((s, c) => s + parseFloat(c.grading_grade ?? '0'), 0) / graded.filter((c) => c.grading_grade).length
      : null;
    return { totalCost, avgGrade, graded: graded.length };
  }, [gradingCards]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement…</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-xl" style={{ color: 'var(--text-primary)' }}>Grading tracker</h2>
        </div>

        {/* Summary pills */}
        {gradingCards.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{gradingCards.length}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Cartes envoyées</div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="text-xl font-bold" style={{ color: stats.totalCost > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                {stats.totalCost > 0 ? `${stats.totalCost.toFixed(0)} €` : '—'}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Coût total</div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="text-xl font-bold" style={{ color: stats.avgGrade != null ? gradeColor(stats.avgGrade.toFixed(1)) : 'var(--text-muted)' }}>
                {stats.avgGrade != null ? stats.avgGrade.toFixed(1) : '—'}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Note moyenne</div>
            </div>
          </div>
        )}

        {/* Status tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-4 w-fit" style={{ background: 'var(--bg-secondary)' }}>
          <button
            onClick={() => setStatusFilter('all')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={statusFilter === 'all' ? { background: 'var(--accent)', color: '#0E0E11' } : { color: 'var(--text-secondary)' }}
          >
            Tout {counts.all > 0 && <span style={{ opacity: 0.7 }}>{counts.all}</span>}
          </button>
          {(Object.keys(STATUS_CONFIG) as GradingStatus[]).map((s) => (
            counts[s] > 0 && (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={statusFilter === s ? { background: 'var(--accent)', color: '#0E0E11' } : { color: 'var(--text-secondary)' }}
              >
                {STATUS_CONFIG[s].label} <span style={{ opacity: 0.7 }}>{counts[s]}</span>
              </button>
            )
          ))}
        </div>

        {/* Card list */}
        {gradingCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 rounded-2xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <span className="text-4xl">🏅</span>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Aucune carte en grading.</p>
            <p className="text-xs text-center px-8" style={{ color: 'var(--text-muted)' }}>
              Pour ajouter une carte au tracker, ouvre-la depuis la collection et clique sur "Grading".
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucune carte avec ce statut.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((card) => (
              <GradingRow
                key={card.id}
                card={card}
                onEdit={setEditCard}
                onOpenCard={setOpenCard}
              />
            ))}
          </div>
        )}
      </div>

      {editCard && <GradingModal card={editCard} onClose={() => setEditCard(null)} />}
      {openCard && <CardDetail card={openCard} onClose={() => setOpenCard(null)} />}
    </div>
  );
}
