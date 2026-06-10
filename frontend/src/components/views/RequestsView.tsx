import { useMemo, useState } from 'react';
import { Inbox, Check, Archive, Trash2, MessageSquare, Clock } from 'lucide-react';
import { useRequests, useUpdateRequest, useDeleteRequest } from '../../hooks/useRequests';
import { useCards } from '../../hooks/useCards';
import { CardDetail } from '../shared/CardDetail';
import type { Card, ShareRequest, ShareRequestStatus } from '../../types';

const STATUS_TABS: { key: ShareRequestStatus | 'all'; label: string }[] = [
  { key: 'new', label: 'Nouvelles' },
  { key: 'contacted', label: 'Contactées' },
  { key: 'archived', label: 'Archivées' },
  { key: 'all', label: 'Toutes' },
];

const STATUS_LABEL: Record<ShareRequestStatus, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  archived: 'Archivé',
};

export function RequestsView() {
  const { data: requests = [], isLoading } = useRequests();
  const { data: cards = [] } = useCards();
  const updateRequest = useUpdateRequest();
  const deleteRequest = useDeleteRequest();
  const [tab, setTab] = useState<ShareRequestStatus | 'all'>('new');
  const [openCard, setOpenCard] = useState<Card | null>(null);

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const counts = useMemo(() => ({
    new: requests.filter((r) => r.status === 'new').length,
    contacted: requests.filter((r) => r.status === 'contacted').length,
    archived: requests.filter((r) => r.status === 'archived').length,
    all: requests.length,
  }), [requests]);

  const filtered = useMemo(
    () => (tab === 'all' ? requests : requests.filter((r) => r.status === tab)),
    [requests, tab],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <div className="flex flex-col gap-4 px-6 py-5 border-b border-white/5 bg-black/20 backdrop-blur-3xl shrink-0">
        <div className="flex items-center gap-3">
          <Inbox size={20} className="text-[var(--accent)]" />
          <h2 className="text-lg font-black text-white">Demandes</h2>
          <span className="text-xs text-[var(--text-muted)]">Cartes qui intéressent les visiteurs de ta collection partagée</span>
        </div>
        <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/5 w-fit">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2"
              style={tab === t.key
                ? { background: 'var(--accent)', color: '#09090B' }
                : { color: 'var(--text-secondary)' }}
            >
              {t.label}
              <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-black ${tab === t.key ? 'bg-black/10' : 'bg-white/10'}`}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-[var(--text-muted)]">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <Inbox size={32} className="opacity-20" />
            <p className="text-sm text-[var(--text-muted)]">Aucune demande pour le moment.</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {filtered.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                cardById={cardById}
                onOpenCard={setOpenCard}
                onStatus={(status) => updateRequest.mutate({ id: req.id, status })}
                onDelete={() => { if (confirm('Supprimer cette demande ?')) deleteRequest.mutate(req.id); }}
              />
            ))}
          </div>
        )}
      </div>
      {openCard && <CardDetail card={openCard} onClose={() => setOpenCard(null)} />}
    </div>
  );
}

function RequestCard({
  req,
  cardById,
  onOpenCard,
  onStatus,
  onDelete,
}: {
  req: ShareRequest;
  cardById: Map<string, Card>;
  onOpenCard: (c: Card) => void;
  onStatus: (s: ShareRequestStatus) => void;
  onDelete: () => void;
}) {
  const ids = req.card_ids ?? [];
  const date = new Date(req.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const total = ids.reduce((sum, id) => sum + (cardById.get(id)?.price ?? 0), 0);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-white">{req.viewer_handle}</span>
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
              style={req.status === 'new'
                ? { background: 'var(--accent-dim)', color: 'var(--accent)' }
                : req.status === 'contacted'
                  ? { background: 'rgba(16,185,129,0.15)', color: '#34d399' }
                  : { background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
            >
              {STATUS_LABEL[req.status]}
            </span>
            {total > 0 && (
              <span className="rounded-md bg-[var(--accent)] px-2 py-0.5 text-[10px] font-black text-black">
                Total {total.toFixed(0)}€
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <Clock size={11} /> {date} · {ids.length} carte{ids.length > 1 ? 's' : ''}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {req.status !== 'contacted' && (
            <button onClick={() => onStatus('contacted')} title="Marquer contacté" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300 hover:bg-emerald-500/20">
              <Check size={15} />
            </button>
          )}
          {req.status !== 'archived' && (
            <button onClick={() => onStatus('archived')} title="Archiver" className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10">
              <Archive size={15} />
            </button>
          )}
          {req.status !== 'new' && (
            <button onClick={() => onStatus('new')} title="Remettre en nouveau" className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-dim)] p-2 text-[var(--accent)] hover:opacity-90">
              <Inbox size={15} />
            </button>
          )}
          <button onClick={onDelete} title="Supprimer" className="rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/15">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {req.message && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white/80">
          <MessageSquare size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
          <span className="whitespace-pre-wrap">{req.message}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const c = cardById.get(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => c && onOpenCard(c)}
              disabled={!c}
              className={`flex w-[88px] flex-col gap-1 rounded-xl text-left transition-all ${c ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
              <div className="aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-black/20">
                {c?.image_front_url
                  ? <img src={c.image_front_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  : <div className="flex h-full items-center justify-center text-[10px] text-white/20">—</div>}
              </div>
              <span className="truncate text-[10px] font-semibold text-white/70" title={c?.player ?? 'Carte supprimée'}>
                {c?.player ?? 'Carte supprimée'}
              </span>
              {c?.price != null && <span className="text-[10px] font-black text-[var(--accent)]">{c.price}€</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
