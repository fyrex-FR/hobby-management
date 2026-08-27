import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, CopyPlus, Eye, PackageCheck, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useCards } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card, ImportAction, ImportBatch, ImportItem } from '../../types';

const CLASS_LABEL = { match: 'Déjà en collection', probable: 'Doublon probable', new: 'Nouvelle carte', insufficient: 'Identification insuffisante', error: 'Erreur', processing: 'Analyse en cours' } as const;
interface BulkResult { processed: number; created: number; shelved: number; remaining: number; manual_review: number }

export function ImportReviewView() {
  const batchId = useAppStore((state) => state.importBatchId);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const { data: cards = [] } = useCards();
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [index, setIndex] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!batchId) return;
    apiFetch<ImportBatch>(`/imports/${batchId}`).then(setBatch).catch((cause) => setError(cause.message));
  }, [batchId]);

  const items = useMemo(() => batch?.items || [], [batch?.items]);
  const item = items[index];
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const candidates = (item?.matches || []).map((match) => ({ match, card: cardById.get(match.card_id) })).filter((entry): entry is { match: ImportItem['matches'][number]; card: Card } => Boolean(entry.card));
  const recommended = useMemo(() => items.filter((entry) => {
    if (entry.action_at) return false;
    const best = entry.matches?.[0];
    return (entry.classification === 'match' && !!best && best.score >= 85)
      || (entry.classification === 'new' && (!best || best.score < 55));
  }), [items]);
  const recommendedCreates = recommended.filter((entry) => entry.classification === 'new').length;
  const recommendedShelves = recommended.length - recommendedCreates;

  useEffect(() => { setSelectedCardId(candidates[0]?.card.id || null); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: ImportAction) {
    if (!item || busy) return;
    if (action === 'increment' && !selectedCardId) { setError('Choisis une carte existante.'); return; }
    setBusy(true); setError('');
    try {
      const updated = await apiFetch<ImportItem>(`/imports/items/${item.id}/action`, {
        method: 'POST', body: JSON.stringify({ action, target_card_id: action === 'increment' || action === 'shelve' ? selectedCardId : null }),
      });
      setBatch((current) => current ? { ...current, items: (current.items || []).map((entry) => entry.id === updated.id ? updated : entry) } : current);
      if (action === 'create' || action === 'increment') await queryClient.invalidateQueries({ queryKey: ['cards'] });
      if (index + 1 < items.length) setIndex(index + 1);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function retry() {
    if (!item || busy) return;
    setBusy(true); setError('');
    try {
      const updated = await apiFetch<ImportItem>(`/imports/items/${item.id}/retry`, { method: 'POST' }, 90000);
      setBatch((current) => current ? { ...current, items: (current.items || []).map((entry) => entry.id === updated.id ? updated : entry) } : current);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  async function applyBulk() {
    if (!batchId || busy || recommended.length === 0) return;
    setBusy(true); setError(''); setShowBulkConfirm(false);
    const total = recommended.length;
    let done = 0;
    setBulkProgress({ done, total });
    try {
      let remaining = total;
      while (remaining > 0) {
        const result = await apiFetch<BulkResult>(`/imports/${batchId}/apply-recommended`, {
          method: 'POST', body: JSON.stringify({ limit: 50 }),
        }, 90000);
        if (result.processed === 0) break;
        done += result.processed;
        remaining = result.remaining;
        setBulkProgress({ done, total });
      }
      const refreshed = await apiFetch<ImportBatch>(`/imports/${batchId}`);
      setBatch(refreshed);
      await queryClient.invalidateQueries({ queryKey: ['cards'] });
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }

  if (!batchId) return <div className="p-10">Aucun sas sélectionné.</div>;
  if (!batch || !item) return <div className="p-10">{error || 'Chargement…'}</div>;
  const identification = item.identification;

  return <div className="max-w-7xl mx-auto p-5 sm:p-8 space-y-5">
    <div className="flex items-center justify-between gap-4">
      <button onClick={() => setActiveView('batch')} className="flex items-center gap-2 text-sm"><ArrowLeft size={17} /> Sas</button>
      <div className="text-center"><strong>{CLASS_LABEL[item.classification]}</strong><small className="block text-[var(--text-muted)]">{index + 1} / {items.length} · {batch.name}</small></div>
      <div className="flex gap-2"><button disabled={index === 0} onClick={() => setIndex(index - 1)} className="p-2 rounded-lg bg-white/5"><ArrowLeft size={16} /></button><button disabled={index + 1 >= items.length} onClick={() => setIndex(index + 1)} className="p-2 rounded-lg bg-white/5"><ArrowRight size={16} /></button></div>
    </div>

    {recommended.length > 0 && <section className="panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[var(--border-accent)]">
      <div><strong className="flex items-center gap-2"><Sparkles size={17} className="text-[var(--accent)]" /> {recommended.length} décisions sûres peuvent être appliquées ensemble</strong><small className="text-[var(--text-muted)]">{recommendedCreates} nouvelles cartes à créer · {recommendedShelves} matchs ≥85 % à mettre de côté · cas ambigus exclus</small></div>
      <button disabled={busy} onClick={() => setShowBulkConfirm(true)} className="px-5 py-3 rounded-xl bg-[var(--accent)] text-black font-black whitespace-nowrap">Appliquer en masse</button>
    </section>}

    {bulkProgress && <section className="panel rounded-2xl p-4 space-y-2"><div className="flex justify-between text-sm"><strong>Décisions en masse</strong><span>{bulkProgress.done} / {bulkProgress.total}</span></div><div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }} /></div></section>}

    {showBulkConfirm && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowBulkConfirm(false)}><div className="panel max-w-md w-full rounded-3xl p-6 space-y-5" onClick={(event) => event.stopPropagation()}><h2 className="text-xl font-black">Confirmer les décisions en masse</h2><p className="text-sm text-[var(--text-muted)]">Créer {recommendedCreates} nouvelles cartes et mettre de côté {recommendedShelves} correspondances à au moins 85 %. Les doublons probables et identifications insuffisantes resteront à vérifier manuellement.</p><div className="grid grid-cols-2 gap-2"><button onClick={() => setShowBulkConfirm(false)} className="p-3 rounded-xl bg-white/5">Annuler</button><button onClick={applyBulk} className="p-3 rounded-xl bg-[var(--accent)] text-black font-black">Appliquer {recommended.length}</button></div></div></div>}

    <div className="grid lg:grid-cols-[minmax(300px,0.8fr)_minmax(420px,1.2fr)] gap-6">
      <section className="panel rounded-3xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3"><img src={item.front_image_url} className="w-full rounded-2xl object-contain max-h-[55vh]" />{item.back_image_url && <img src={item.back_image_url} className="w-full rounded-2xl object-contain max-h-[55vh]" />}</div>
        {identification && <div className="grid grid-cols-2 gap-2 text-sm">
          <strong>{identification.player || 'Joueur non lu'}</strong><span>{identification.year}</span><span>{identification.brand} {identification.set}</span><span>{identification.card_number}</span><span>{identification.insert}</span><span>{identification.parallel}</span><span>{identification.serial_number || identification.numbered}</span>
        </div>}
        {item.error && <div className="space-y-2"><p className="text-red-400 text-sm">{item.error}</p><button disabled={busy} onClick={retry} className="px-3 py-2 rounded-xl bg-white/10 text-sm flex gap-2"><RefreshCw size={15} /> Relancer l’identification</button></div>}
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Meilleurs matchs existants</h2>
        {candidates.length === 0 && <div className="panel rounded-2xl p-8 text-center text-[var(--text-muted)]">Aucun candidat suffisamment proche.</div>}
        {candidates.map(({ match, card }) => <button key={card.id} onClick={() => setSelectedCardId(card.id)} className="panel w-full rounded-2xl p-4 text-left grid grid-cols-[72px_1fr_auto] gap-4" style={{ borderColor: selectedCardId === card.id ? 'var(--accent)' : undefined }}>
          {card.image_front_url ? <img src={card.image_front_url} className="w-[72px] h-24 rounded-lg object-cover" /> : <div className="w-[72px] h-24 bg-white/5 rounded-lg" />}
          <span><strong className="block">{card.player}</strong><small className="text-[var(--text-muted)]">{card.year} · {card.brand} {card.set_name} · {card.card_number}</small><span className="block mt-2 text-xs">{match.reasons.join(' · ') || 'Peu de signaux communs'}</span>{match.conflicts.length > 0 && <span className="block text-xs text-amber-400">Différences : {match.conflicts.join(', ')}</span>}</span>
          <strong className="text-[var(--accent)]">{match.score}%</strong>
        </button>)}

        {item.action_at ? <div className="panel rounded-2xl p-4 text-green-400 flex gap-2"><Check size={18} /> Traité : {item.action}</div> : <div className="grid sm:grid-cols-2 gap-2 pt-3">
          <button disabled={busy} onClick={() => act('shelve')} className="p-3 rounded-xl bg-amber-500/15 flex justify-center gap-2"><PackageCheck size={17} /> Mettre de côté</button>
          <button disabled={busy} onClick={() => act('increment')} className="p-3 rounded-xl bg-blue-500/15 flex justify-center gap-2"><CopyPlus size={17} /> Ajouter un exemplaire</button>
          <button disabled={busy} onClick={() => act('create')} className="p-3 rounded-xl bg-[var(--accent)] text-black flex justify-center gap-2"><Plus size={17} /> Créer la carte</button>
          <button disabled={busy} onClick={() => act('review')} className="p-3 rounded-xl bg-white/10 flex justify-center gap-2"><Eye size={17} /> À revoir</button>
          <button disabled={busy} onClick={() => act('ignore')} className="sm:col-span-2 p-3 rounded-xl bg-white/5 flex justify-center gap-2"><X size={17} /> Ignorer</button>
        </div>}
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </section>
    </div>
  </div>;
}
