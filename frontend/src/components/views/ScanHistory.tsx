import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { groupByDay, useDeleteScan, useScans, type ScanRow } from '../../lib/scanHistory';
import { errorMessage, toast } from '../../lib/feedback';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function title(r: ScanRow) {
  const i = r.ident;
  return [i.player || 'Carte inconnue', i.year, i.set || i.brand, i.parallel].filter(Boolean).join(' · ');
}

export function ScanHistory({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useScans();
  const del = useDeleteScan();
  const [open, setOpen] = useState<{ row: ScanRow; front?: string; back?: string } | null>(null);

  async function show(row: ScanRow) {
    setOpen({ row });
    try {
      const imgs = await apiFetch<{ front?: string; back?: string }>(`/scans/${row.id}`);
      setOpen({ row, ...imgs });
    } catch (e) {
      toast.error('Photos indisponibles', { description: errorMessage(e) });
    }
  }

  const groups = groupByDay(data ?? []);

  return (
    <div className="dark-scope absolute inset-0 z-30 flex flex-col bg-black text-[var(--text-primary)]">
      <div className="flex items-center justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <h2 className="text-base font-semibold">Historique des scans</h2>
        <button className="ui-btn ui-btn-sm" onClick={onClose} aria-label="Fermer"><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-8">
        {isLoading && <p className="text-sm text-[var(--text-secondary)]">Chargement…</p>}
        {!isLoading && groups.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Aucun scan pour l’instant.</p>}
        {groups.map((g) => (
          <section key={g.day} className="mb-5">
            <div className="mb-2 flex items-baseline justify-between text-[13px] text-[var(--text-secondary)]">
              <span className="capitalize">{dayLabel(g.day)} · {g.rows.length} scan{g.rows.length > 1 ? 's' : ''}</span>
              {g.total > 0 && <span className="tabular font-semibold text-white">{euro.format(g.total)}</span>}
            </div>
            <ul className="space-y-2">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <button onClick={() => show(r)} className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2 text-left">
                    {r.thumb && <img src={r.thumb} alt="" className="h-14 w-10 rounded object-cover" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{title(r)}</span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {new Date(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {r.card_id ? ' · ajoutée' : ''}
                      </span>
                    </span>
                    <span className="tabular text-sm font-semibold">{r.estimate_value != null ? euro.format(r.estimate_value) : '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {open && (
        <div className="absolute inset-0 z-40 flex flex-col gap-3 overflow-auto bg-black/95 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium">{title(open.row)}</p>
            <div className="flex gap-2">
              <button
                className="ui-btn ui-btn-sm"
                onClick={() => del.mutate(open.row.id, { onSuccess: () => setOpen(null), onError: (e) => toast.error('Suppression impossible', { description: errorMessage(e) }) })}
                aria-label="Supprimer"
              ><Trash2 size={16} /></button>
              <button className="ui-btn ui-btn-sm" onClick={() => setOpen(null)} aria-label="Fermer"><X size={16} /></button>
            </div>
          </div>
          <p className="text-sm">
            {open.row.estimate_value != null ? `Estimation ${euro.format(open.row.estimate_value)}` : 'Pas d’estimation'}
            {open.row.card_id ? ' · ajoutée à la Collection' : ''}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {open.front ? <img src={open.front} alt="Recto" className="w-full rounded-lg" /> : <div className="aspect-[63/88] rounded-lg bg-white/5" />}
            {open.back && <img src={open.back} alt="Verso" className="w-full rounded-lg" />}
          </div>
        </div>
      )}
    </div>
  );
}
