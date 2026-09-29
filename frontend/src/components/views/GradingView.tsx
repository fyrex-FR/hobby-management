import { useState, useMemo } from 'react';
import {
  Trophy,
  Clock,
  Pencil,
  CreditCard,
  Loader2,
  Hourglass,
  CheckCircle2,
  Star,
  Euro,
  Award,
} from 'lucide-react';
import { useCards, useUpdateCard } from '../../hooks/useCards';
import type { Card, GradingCompany, GradingStatus } from '../../types';
import { CardDetail } from '../shared/CardDetail';
import { cdnImg } from '../../lib/cdn';
import { Badge, EmptyState, Field, Modal, Page, PageHeader, Spinner, StatTile } from '../ui';

const GRADING_COMPANIES: GradingCompany[] = ['PSA', 'BGS', 'SGC', 'CGC', 'HGA'];

const STATUS_CONFIG: Record<GradingStatus, { label: string; tone: 'blue' | 'accent' | 'green' | 'neutral' }> = {
  submitted: { label: 'Envoyée', tone: 'blue' },
  received: { label: 'Reçue', tone: 'accent' },
  graded: { label: 'Notée', tone: 'green' },
  returned: { label: 'Retournée', tone: 'neutral' },
};

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const gradeFmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function gradeColor(grade: string | null): string {
  if (!grade) return 'var(--text-muted)';
  const n = parseFloat(grade);
  if (n >= 9.5) return 'var(--green)';
  if (n >= 9) return 'var(--blue)';
  if (n >= 8) return 'var(--accent)';
  return 'var(--text-secondary)';
}

function StatusBadge({ status }: { status: GradingStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
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
  const waitingDays = days != null && !card.grading_returned_at ? days : null;
  const late = waitingDays != null && waitingDays > 60;

  return (
    <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
      <button
        onClick={() => onOpenCard(card)}
        className="group flex min-w-0 flex-1 items-center gap-3 text-left"
        title="Ouvrir la fiche"
      >
        <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]">
          {card.image_front_url ? (
            <img src={cdnImg(card.image_front_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]"><CreditCard size={18} /></div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-[var(--text-primary)] group-hover:underline">{card.player || '—'}</p>
            {card.grading_status && <StatusBadge status={card.grading_status} />}
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
            {[card.year, card.brand, card.set_name].filter(Boolean).join(' · ') || '—'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
            {card.grading_company && <Badge>{card.grading_company}</Badge>}
            {card.grading_cert && <span className="tabular text-[var(--text-muted)]">Cert. {card.grading_cert}</span>}
            {waitingDays != null && (
              <span
                className={`tabular inline-flex items-center gap-1 ${late ? 'text-[var(--red)]' : 'text-[var(--text-muted)]'}`}
                title={`Envoyée il y a ${waitingDays} jour${waitingDays > 1 ? 's' : ''}`}
              >
                <Clock size={12} />
                {waitingDays} j
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {card.grading_grade && (
          <div className="text-right">
            <div className="tabular text-xl font-semibold leading-none" style={{ color: gradeColor(card.grading_grade) }}>
              {card.grading_grade}
            </div>
            {card.grading_company && <div className="mt-1 text-[11px] text-[var(--text-muted)]">{card.grading_company}</div>}
          </div>
        )}
        <button
          onClick={() => onEdit(card)}
          className="ui-btn ui-btn-ghost ui-btn-icon"
          aria-label="Modifier le grading"
          title="Modifier le grading"
        >
          <Pencil size={15} />
        </button>
      </div>
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

  return (
    <Modal
      onClose={onClose}
      size="md"
      title="Détails du grading"
      subtitle={[card.player, card.year].filter(Boolean).join(' · ') || undefined}
      icon={
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-dim)] text-[var(--accent)]">
          <Award size={18} />
        </div>
      }
      footer={
        <>
          <button onClick={onClose} className="ui-btn" disabled={saving}>Annuler</button>
          <button onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary">
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => { e.preventDefault(); if (!saving) handleSave(); }}
      >
        <Field label="Société">
          <select className="ui-select" value={form.grading_company} onChange={(e) => set('grading_company', e.target.value)}>
            <option value="">—</option>
            {GRADING_COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select className="ui-select" value={form.grading_status} onChange={(e) => set('grading_status', e.target.value)}>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Envoyée le">
          <input type="date" className="ui-input" value={form.grading_submitted_at} onChange={(e) => set('grading_submitted_at', e.target.value)} />
        </Field>
        <Field label="Retour le">
          <input type="date" className="ui-input" value={form.grading_returned_at} onChange={(e) => set('grading_returned_at', e.target.value)} />
        </Field>
        <Field label="Note">
          <input className="ui-input tabular" placeholder="ex. 10" value={form.grading_grade} onChange={(e) => set('grading_grade', e.target.value)} />
        </Field>
        <Field label="N° de certificat">
          <input className="ui-input tabular" placeholder="ex. 12345678" value={form.grading_cert} onChange={(e) => set('grading_cert', e.target.value)} />
        </Field>
        <Field label="Coût (€)" className="col-span-2">
          <input type="number" inputMode="decimal" step="0.01" min="0" className="ui-input tabular" placeholder="0,00" value={form.grading_cost} onChange={(e) => set('grading_cost', e.target.value)} />
        </Field>
        {/* Entrée dans un champ = Enregistrer */}
        <button type="submit" hidden />
      </form>
    </Modal>
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

  const inProgress = (counts.submitted ?? 0) + (counts.received ?? 0);

  if (isLoading) {
    return (
      <Page>
        <PageHeader title="Grading" />
        <Spinner label="Chargement…" className="py-24" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Grading" subtitle="Suivi des soumissions, des notes et des certificats" />

      {gradingCards.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            icon={Trophy}
            title="Aucune carte en grading"
            description="Renseigne la société de grading depuis la fiche d'une carte pour suivre sa soumission ici."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="En cours" value={inProgress} hint="Envoyées ou reçues" icon={Hourglass} />
            <StatTile label="Notées" value={stats.graded} hint="Notées ou retournées" icon={CheckCircle2} />
            <StatTile
              label="Note moyenne"
              value={stats.avgGrade ? <span style={{ color: gradeColor(stats.avgGrade.toFixed(1)) }}>{gradeFmt.format(stats.avgGrade)}</span> : '—'}
              icon={Star}
            />
            <StatTile label="Investi" value={euro.format(stats.totalCost)} hint="Frais de grading" icon={Euro} accent={stats.totalCost > 0} />
          </div>

          <div className="ui-segmented max-w-full overflow-x-auto no-scrollbar" role="tablist" aria-label="Filtrer par statut">
            <button role="tab" aria-selected={statusFilter === 'all'} data-active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              Toutes <span className="count">{counts.all}</span>
            </button>
            {(Object.keys(STATUS_CONFIG) as GradingStatus[]).map((s) => (
              counts[s] > 0 && (
                <button key={s} role="tab" aria-selected={statusFilter === s} data-active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                  {STATUS_CONFIG[s].label} <span className="count">{counts[s]}</span>
                </button>
              )
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="ui-card">
              <EmptyState icon={Trophy} title="Aucune carte dans ce statut" />
            </div>
          ) : (
            <div className="ui-card divide-y divide-[var(--border)] overflow-hidden">
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
        </>
      )}

      {editCard && <GradingModal card={editCard} onClose={() => setEditCard(null)} />}
      {openCard && <CardDetail card={openCard} onClose={() => setOpenCard(null)} />}
    </Page>
  );
}
