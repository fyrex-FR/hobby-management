import { useState } from 'react';
import { Bot, Check, ExternalLink, X } from 'lucide-react';
import { errorMessage, toast } from '../../lib/feedback';
import { formatEuro } from '../../lib/salon';
import { cdnImg } from '../../lib/cdn';
import { usePricingDecision, usePricingRuns, type PricingRun, type PricingSale } from '../../lib/pricingRuns';
import { Badge, EmptyState, Page, PageHeader, Panel, Spinner } from '../ui';

const STATUS = {
  pending: { label: 'À valider', tone: 'accent' },
  accepted: { label: 'Validé', tone: 'green' },
  rejected: { label: 'Rejeté', tone: 'neutral' },
  error: { label: 'Sans prix', tone: 'red' },
} as const;

function Sales({ title, sales, tone }: { title: string; sales: PricingSale[]; tone: 'green' | 'red' }) {
  if (!sales.length) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-medium text-[var(--text-secondary)]">{title} ({sales.length})</div>
      <ul className="divide-y divide-[var(--border)] text-xs">
        {sales.map((s, i) => (
          <li key={i} className="flex items-start gap-2 py-1.5">
            <Badge tone={tone}>{formatEuro(s.price)}</Badge>
            <div className="min-w-0 flex-1">
              <div className="break-words">{s.title}</div>
              {s.reason && <div className="text-[var(--text-secondary)]">{s.reason}</div>}
            </div>
            {s.url && <a href={s.url} target="_blank" rel="noreferrer" aria-label="Voir la vente"><ExternalLink size={12} /></a>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunPanel({ run }: { run: PricingRun }) {
  const decide = usePricingDecision();
  const [price, setPrice] = useState(run.proposed_price?.toString() ?? '');
  const [open, setOpen] = useState(run.status === 'pending');
  const c = run.card;
  const st = STATUS[run.status];
  const open_ = run.status === 'pending' || run.status === 'error';
  const go = (action: 'accept' | 'reject') =>
    decide.mutate({ id: run.id, action, price: price ? Number(price) : undefined }, {
      onSuccess: () => toast.success(action === 'accept' ? 'Prix appliqué' : 'Proposition rejetée'),
      onError: (e) => toast.error('Action impossible', { description: errorMessage(e) }),
    });
  return (
    <Panel>
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)}>
        <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-[var(--bg-secondary)]">
          {c?.image_front_url && <img src={cdnImg(c.image_front_url)} alt="" className="h-full w-full object-cover" loading="lazy" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{c?.player ?? 'Carte'}</div>
          <div className="truncate text-xs text-[var(--text-secondary)]">{[c?.year, c?.set_name || c?.brand, c?.insert_name, c?.parallel_name, c?.numbered].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold">{run.proposed_price != null ? formatEuro(run.proposed_price) : '—'}</span>
          <span className="flex gap-1"><Badge tone={st.tone}>{st.label}</Badge>{run.confidence && <Badge>{run.confidence}</Badge>}</span>
        </div>
      </button>
      {open && (
        <div className="mt-3 border-t border-[var(--border)] pt-3 text-sm">
          {run.median != null && <p>Médiane des ventes retenues : <b>{formatEuro(run.median)}</b> → proposition <b>{formatEuro(run.proposed_price ?? 0)}</b> (médiane + 17,5 %, arrondi).</p>}
          {run.reasoning && <p className="mt-1 text-[var(--text-secondary)]">{run.reasoning}</p>}
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Recherche : {run.query} · {run.model} · {new Date(run.created_at).toLocaleString('fr-FR')}</p>
          <Sales title="Ventes retenues" sales={run.kept} tone="green" />
          <Sales title="Ventes écartées" sales={run.rejected} tone="red" />
          {open_ && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input className="ui-input h-9 w-24" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} aria-label="Prix" />
              <button className="ui-btn h-9 px-3" disabled={decide.isPending || !price} onClick={() => go('accept')}><Check size={14} /> Valider</button>
              <button className="ui-btn h-9 px-3" disabled={decide.isPending} onClick={() => go('reject')}><X size={14} /> Rejeter</button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function PricingAutoView() {
  const { data, isLoading, error } = usePricingRuns();
  const runs = data?.runs ?? [];
  const pending = runs.filter((r) => r.status === 'pending').length;
  return (
    <Page width="narrow">
      <PageHeader title="Pricing auto" subtitle={`${pending} à valider · ${runs.length} analyses`} />
      {isLoading ? <Spinner /> : error ? <p className="text-sm text-[var(--red)]">{errorMessage(error)}</p>
        : runs.length === 0 ? <EmptyState icon={Bot} title="Aucune analyse" description="L'agent passe chaque jour sur les cartes à vendre sans prix." />
        : <div className="flex flex-col gap-3">{runs.map((r) => <RunPanel key={r.id} run={r} />)}</div>}
    </Page>
  );
}
