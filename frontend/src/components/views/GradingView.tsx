import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Clock,
  Edit3,
  X,
  CreditCard,
  Building,
  RefreshCw
} from 'lucide-react';
import { useCards, useUpdateCard } from '../../hooks/useCards';
import type { Card, GradingCompany, GradingStatus } from '../../types';
import { CardDetail } from '../shared/CardDetail';

const GRADING_COMPANIES: GradingCompany[] = ['PSA', 'BGS', 'SGC', 'CGC', 'HGA'];

const STATUS_CONFIG: Record<GradingStatus, { label: string; color: string; bg: string }> = {
  submitted: { label: 'Envoyée', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  received: { label: 'Reçue', color: 'var(--accent)', bg: 'var(--accent-dim)' },
  graded: { label: 'Notée', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  returned: { label: 'Retournée', color: '#A1A1AA', bg: 'white/5' },
};

function gradeColor(grade: string | null): string {
  if (!grade) return 'var(--text-muted)';
  const n = parseFloat(grade);
  if (n >= 9.5) return '#10b981';
  if (n >= 9) return '#60a5fa';
  if (n >= 8) return 'var(--accent)';
  return '#A1A1AA';
}

function StatusBadge({ status }: { status: GradingStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border border-white/5"
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex items-center gap-5 p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all active:scale-[0.99]"
    >
      <div
        className="w-16 h-20 rounded-2xl bg-white/5 border border-white/5 overflow-hidden cursor-pointer relative shrink-0"
        onClick={() => onOpenCard(card)}
      >
        {card.image_front_url ? (
          <img src={card.image_front_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20"><CreditCard size={20} /></div>
        )}
      </div>

      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="font-black text-white tracking-tight truncate flex-1">
            {card.player || '—'}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {card.grading_status && <StatusBadge status={card.grading_status} />}
          </div>
        </div>

        <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wide truncate">
          {[card.year, card.brand, card.set_name].filter(Boolean).join(' · ')}
        </p>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {card.grading_company && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-black text-white/40 border border-white/5 text-[9px] font-black tracking-widest">
              <Building size={10} />
              {card.grading_company}
            </div>
          )}
          {card.grading_cert && (
            <span className="text-[10px] font-medium text-white/30">#{card.grading_cert}</span>
          )}
          {days != null && !card.grading_returned_at && (
            <div className={`flex items-center gap-1 text-[10px] font-bold ${days > 60 ? 'text-red-400' : 'text-white/30'}`}>
              <Clock size={12} strokeWidth={2.5} />
              {days}j
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {card.grading_grade && (
          <div className="text-right">
            <div className="text-2xl font-black italic tracking-tighter" style={{ color: gradeColor(card.grading_grade) }}>
              {card.grading_grade}
            </div>
            <div className="text-[8px] font-black text-white/20 uppercase tracking-widest">NR-MT</div>
          </div>
        )}
        <button
          onClick={() => onEdit(card)}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/5 text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all active:scale-90"
        >
          <Edit3 size={16} />
        </button>
      </div>
    </motion.div>
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

  const inputCls = 'w-full rounded-xl px-3 py-2 text-sm outline-none transition-all bg-white/5 border border-white/10 focus:border-[var(--accent)]/50 focus:bg-white/10 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="panel w-full max-w-sm rounded-[32px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-black text-white">Grading Details</h3>
            <button onClick={onClose} className="text-white/40 hover:text-white"><X size={20} /></button>
          </div>
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest truncate">
            {card.player} · {card.year}
          </p>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#52525B]">SOCIÉTÉ</label>
              <select className={inputCls} value={form.grading_company} onChange={(e) => set('grading_company', e.target.value)}>
                <option value="">—</option>
                {GRADING_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#52525B]">STATUT</label>
              <select className={inputCls} value={form.grading_status} onChange={(e) => set('grading_status', e.target.value)}>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#52525B]">ENVOYÉE LE</label>
              <input type="date" className={inputCls} value={form.grading_submitted_at} onChange={(e) => set('grading_submitted_at', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#52525B]">RETOUR LE</label>
              <input type="date" className={inputCls} value={form.grading_returned_at} onChange={(e) => set('grading_returned_at', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#52525B]">NOTE</label>
              <input className={inputCls} placeholder="ex: 10" value={form.grading_grade} onChange={(e) => set('grading_grade', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#52525B]">CERTIFICAT</label>
              <input className={inputCls} placeholder="ex: 1234..." value={form.grading_cert} onChange={(e) => set('grading_cert', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#52525B]">COÛT (€)</label>
            <input type="number" className={inputCls} placeholder="0.00" value={form.grading_cost} onChange={(e) => set('grading_cost', e.target.value)} />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-[var(--accent)] border border-[var(--border-accent)] text-[#09090B] text-xs font-black uppercase tracking-widest shadow-xl shadow-[var(--accent-glow)] hover:brightness-110 active:scale-[0.98] mt-2 transition-all"
          >
            {saving ? 'SAUVEGARDE…' : 'SAUVEGARDER'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function GradingView() {
  const { data: cards = [], isLoading } = useCards();
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [statusFilter, setStatusFilter] = useState<GradingStatus | 'all'>('all');

  const gradingCards = useMemo(
    () => cards.filter((c) => c.grading_status || c.grading_company),
    [cards],
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return gradingCards;
    return gradingCards.filter((c) => c.grading_status === statusFilter);
  }, [gradingCards, statusFilter]);

  const counts = useMemo(() => {
    const r: Record<string, number> = { all: gradingCards.length };
    gradingCards.forEach((c) => {
      if (c.grading_status) r[c.grading_status] = (r[c.grading_status] ?? 0) + 1;
    });
    return r;
  }, [gradingCards]);

  const stats = useMemo(() => {
    const totalCost = gradingCards.reduce((s, c) => s + (c.grading_cost ?? 0), 0);
    const graded = gradingCards.filter((c) => c.grading_status === 'graded' || c.grading_status === 'returned');
    const validGrades = graded.filter((c) => c.grading_grade && !isNaN(parseFloat(c.grading_grade)));
    const avgGrade = validGrades.length > 0
      ? validGrades.reduce((s, c) => s + parseFloat(c.grading_grade!), 0) / validGrades.length
      : null;
    return { totalCost, avgGrade, graded: graded.length };
  }, [gradingCards]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={40} className="text-[var(--accent)] animate-spin opacity-20" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Grading Studio</h2>
            <p className="text-sm text-[var(--text-muted)] font-medium">Suivi de vos soumissions et certifications</p>
          </div>
          {gradingCards.length > 0 && (
            <div className="flex gap-3">
              <div className="panel px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/10 text-center">
                <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em] mb-0.5">Note Moyenne</div>
                <div className="text-sm font-black text-white tracking-tighter" style={{ color: stats.avgGrade ? gradeColor(stats.avgGrade.toFixed(1)) : 'white' }}>
                  {stats.avgGrade ? stats.avgGrade.toFixed(1) : '—'}
                </div>
              </div>
              <div className="panel px-4 py-2 rounded-2xl bg-white/[0.02] border border-white/10 text-center">
                <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.1em] mb-0.5">Total Investi</div>
                <div className="text-sm font-black text-[var(--accent)] tracking-tighter">
                  {stats.totalCost.toFixed(0)}€
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/5 border border-white/5 w-fit mb-8">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === 'all' ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-white/40 hover:text-white/60'
              }`}
          >
            Tout ({counts.all})
          </button>
          {(Object.keys(STATUS_CONFIG) as GradingStatus[]).map((s) => (
            counts[s] > 0 && (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-white/10 text-white border border-white/10 shadow-sm' : 'text-white/40 hover:text-white/60'
                  }`}
              >
                {STATUS_CONFIG[s].label} ({counts[s]})
              </button>
            )
          ))}
        </div>

        {gradingCards.length === 0 ? (
          <div className="panel p-12 rounded-[40px] bg-white/[0.02] border border-white/5 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-[24px] bg-white/5 border border-white/10 flex items-center justify-center text-white/20 mb-6">
              <Trophy size={32} />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Aucun Grading en cours</h3>
            <p className="text-sm text-[var(--text-muted)] max-w-xs mx-auto leading-relaxed">
              Ajoutez des détails de grading à vos cartes depuis leur fiche détaillée pour les suivre ici.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((card) => (
                <GradingRow
                  key={card.id}
                  card={card}
                  onEdit={setEditCard}
                  onOpenCard={setOpenCard}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {editCard && <GradingModal card={editCard} onClose={() => setEditCard(null)} />}
        {openCard && <CardDetail card={openCard} onClose={() => setOpenCard(null)} />}
      </AnimatePresence>
    </div>
  );
}
