import { useMemo, useState } from 'react';
import { Inbox, Check, Archive, Trash2, MessageSquare, Clock, Download, ShoppingBag, ImageOff } from 'lucide-react';
import { useRequests, useUpdateRequest, useDeleteRequest } from '../../hooks/useRequests';
import { useCards, useUpdateCard } from '../../hooks/useCards';
import { CardDetail } from '../shared/CardDetail';
import { cdnImg } from '../../lib/cdn';
import type { Card, ShareRequest, ShareRequestStatus } from '../../types';
import { Badge, EmptyState, Page, PageHeader, Spinner } from '../ui';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
function formatEuro(v: number): string {
  return euro.format(v);
}

const STATUS_TONE: Record<ShareRequestStatus, 'accent' | 'green' | 'neutral'> = {
  new: 'accent',
  contacted: 'green',
  archived: 'neutral',
};

const EMPTY_TEXT: Record<ShareRequestStatus | 'all', string> = {
  new: 'Aucune nouvelle demande. Partage ta collection pour en recevoir.',
  contacted: 'Aucune demande marquée comme contactée.',
  archived: 'Aucune demande archivée.',
  all: 'Les visiteurs de ta collection partagée pourront t\u2019envoyer leur sélection ici.',
};

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
  const updateCard = useUpdateCard();
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
    <Page width="narrow">
      <PageHeader title="Demandes" subtitle="Cartes qui intéressent les visiteurs de ta collection partagée" />

      <div className="ui-segmented max-w-full overflow-x-auto no-scrollbar" role="tablist">
        {STATUS_TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} data-active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
            <span className="count">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner label="Chargement…" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucune demande pour le moment" description={EMPTY_TEXT[tab]} />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              cardById={cardById}
              onOpenCard={setOpenCard}
              onStatus={(status) => updateRequest.mutate({ id: req.id, status })}
              onMarkSold={async (soldIds) => {
                await Promise.all(soldIds.map((id) => {
                  const c = cardById.get(id);
                  if (!c) return Promise.resolve();
                  // Quantité > 1 : on retire un exemplaire. Sinon : vendu.
                  if ((c.quantity ?? 1) > 1) {
                    return updateCard.mutateAsync({ id, quantity: (c.quantity ?? 1) - 1 });
                  }
                  return updateCard.mutateAsync({ id, status: 'vendu' });
                }));
                if (req.status === 'new') updateRequest.mutate({ id: req.id, status: 'contacted' });
              }}
              onDelete={() => { if (confirm('Supprimer cette demande ?')) deleteRequest.mutate(req.id); }}
            />
          ))}
        </div>
      )}
      {openCard && <CardDetail card={openCard} onClose={() => setOpenCard(null)} />}
    </Page>
  );
}

function RequestCard({
  req,
  cardById,
  onOpenCard,
  onStatus,
  onMarkSold,
  onDelete,
}: {
  req: ShareRequest;
  cardById: Map<string, Card>;
  onOpenCard: (c: Card) => void;
  onStatus: (s: ShareRequestStatus) => void;
  onMarkSold: (ids: string[]) => Promise<void> | void;
  onDelete: () => void;
}) {
  const ids = req.card_ids ?? [];
  const date = new Date(req.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const [markingSold, setMarkingSold] = useState(false);
  // Cartes encore présentes et pas déjà vendues.
  const sellableIds = ids.filter((id) => { const c = cardById.get(id); return c && c.status !== 'vendu'; });
  const total = ids.reduce((sum, id) => sum + (cardById.get(id)?.price ?? 0), 0);

  function exportCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['Joueur', 'Annee', 'Marque', 'Set', 'Insert', 'Parallele', 'Numerote', 'Type', 'Prix', 'Vinted', 'eBay'];
    const rows = ids.map((id) => {
      const c = cardById.get(id);
      return [
        c?.player ?? 'Carte supprimee',
        c?.year ?? '',
        c?.brand ?? '',
        c?.set_name ?? '',
        c?.insert_name ?? '',
        c?.parallel_name ?? '',
        c?.numbered ?? '',
        c?.card_type ?? '',
        c?.price ?? '',
        c?.vinted_url ?? '',
        c?.ebay_url ?? '',
      ].map(esc).join(';');
    });
    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeHandle = (req.viewer_handle || 'demande').replace(/[^\w.-]+/g, '_').slice(0, 40);
    a.href = url;
    a.download = `selection-${safeHandle}-${req.created_at.slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const isNew = req.status === 'new';

  return (
    <article className={`ui-card p-4 ${isNew ? 'border-[var(--border-accent)]' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              isNew ? 'bg-[var(--accent-dim)] text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
            }`}
            aria-hidden="true"
          >
            {(req.viewer_handle.replace(/^@/, '')[0] ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className={`truncate text-sm ${isNew ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)]'}`}>
                {req.viewer_handle}
              </span>
              <Badge tone={STATUS_TONE[req.status]}>{STATUS_LABEL[req.status]}</Badge>
              {total > 0 && (
                <Badge tone="accent"><span className="tabular">Total {formatEuro(total)}</span></Badge>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Clock size={12} /> {date} · {ids.length} carte{ids.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {req.status !== 'contacted' && (
            <button onClick={() => onStatus('contacted')} title="Marquer contacté" className="ui-btn ui-btn-sm">
              <Check size={14} /> Contacté
            </button>
          )}
          {sellableIds.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm(`Passer ${sellableIds.length} carte(s) en vendu ?\n(les cartes en plusieurs exemplaires seront décrémentées de 1)`)) return;
                setMarkingSold(true);
                try { await onMarkSold(sellableIds); } finally { setMarkingSold(false); }
              }}
              disabled={markingSold}
              title="Marquer ces cartes comme vendues (décrémente les multi-exemplaires)"
              className="ui-btn ui-btn-sm"
            >
              <ShoppingBag size={14} className="text-[var(--green)]" /> {markingSold ? '…' : 'Tout vendu'}
            </button>
          )}
          <button onClick={exportCsv} title="Exporter la liste (CSV)" aria-label="Exporter la liste (CSV)" className="ui-btn ui-btn-sm ui-btn-icon">
            <Download size={14} />
          </button>
          {req.status !== 'archived' && (
            <button onClick={() => onStatus('archived')} title="Archiver" aria-label="Archiver" className="ui-btn ui-btn-sm ui-btn-icon">
              <Archive size={14} />
            </button>
          )}
          {req.status !== 'new' && (
            <button onClick={() => onStatus('new')} title="Remettre en nouveau" aria-label="Remettre en nouveau" className="ui-btn ui-btn-sm ui-btn-icon">
              <Inbox size={14} />
            </button>
          )}
          <button onClick={onDelete} title="Supprimer" aria-label="Supprimer" className="ui-btn ui-btn-sm ui-btn-icon ui-btn-danger">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {req.message && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5 text-[13px] leading-snug text-[var(--text-primary)]">
          <MessageSquare size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
          <span className="min-w-0 whitespace-pre-wrap break-words">{req.message}</span>
        </div>
      )}

      {ids.length > 0 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
          {ids.map((id) => {
            const c = cardById.get(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => c && onOpenCard(c)}
                disabled={!c}
                className={`group flex w-[84px] shrink-0 flex-col gap-1 text-left ${c ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`aspect-[3/4] overflow-hidden rounded-lg border bg-[var(--bg-secondary)] transition-colors ${c ? 'border-[var(--border)] group-hover:border-[var(--border-strong)]' : 'border-dashed border-[var(--border-strong)]'}`}>
                  {c?.image_front_url
                    ? <img src={cdnImg(c.image_front_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center text-[var(--text-muted)]"><ImageOff size={16} /></div>}
                </div>
                <span className={`truncate text-[11px] font-medium ${c ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`} title={c?.player ?? 'Carte supprimée'}>
                  {c?.player ?? 'Carte supprimée'}
                </span>
                {c?.price != null && <span className="tabular text-[11px] font-semibold text-[var(--price)]">{formatEuro(c.price)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
