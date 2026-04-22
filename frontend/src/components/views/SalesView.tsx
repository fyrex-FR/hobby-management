import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  DollarSign,
  CheckCircle2,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Tag,
  Target,
  LineChart,
  PackageCheck,
  PackageOpen,
  Filter,
  Check,
  RefreshCw
} from 'lucide-react';
import { useCards, useUpdateCard } from '../../hooks/useCards';
import type { Card } from '../../types';
import { CardDetail } from '../shared/CardDetail';

type SalesTab = 'stats' | 'a_traiter' | 'pret' | 'en_ligne' | 'vendu';

const TABS: { key: SalesTab; label: string; icon: any; description: string }[] = [
  { key: 'stats', label: 'Monitor', icon: BarChart3, description: 'Tableau de bord financier' },
  { key: 'a_traiter', label: 'Listing', icon: Tag, description: 'Cartes à préparer pour la vente' },
  { key: 'pret', label: 'Prêtes', icon: PackageCheck, description: 'Prêtes à être postées' },
  { key: 'en_ligne', label: 'Live', icon: Globe, description: 'Actuellement sur le marché' },
  { key: 'vendu', label: 'Vendu', icon: ShoppingBag, description: 'Historique des ventes' },
];

function Globe({ size, className }: { size?: number, className?: string }) {
  return <ShoppingBag size={size} className={className} />; // Shim
}

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function KpiCard({
  label, value, sub, icon: Icon, accent, positive,
}: {
  label: string; value: string; sub?: string; icon: any; accent?: boolean; positive?: boolean;
}) {
  return (
    <div className="panel p-5 rounded-[32px] bg-white/[0.02] border border-white/5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-white/20">
          <Icon size={18} />
        </div>
        {positive !== undefined && (
          <div className={`flex items-center gap-1 text-[10px] font-black ${positive ? 'text-green-400' : 'text-red-400'}`}>
            {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {positive ? 'PROFIT' : 'LOSS'}
          </div>
        )}
      </div>
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">{label}</div>
        <div className={`text-2xl font-black tracking-tighter ${accent ? 'text-[var(--accent)] text-glow' : 'text-white'}`}>{value}</div>
        {sub && <div className="text-[10px] font-bold text-white/20 mt-1 uppercase tracking-wider">{sub}</div>}
      </div>
    </div>
  );
}

function FunnelStage({ label, count, total, color, icon: Icon }: { label: string; count: number; total: number; color: string; icon: any }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Icon size={10} className="text-white/20" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{label}</span>
        </div>
        <span className="text-[10px] font-black text-white">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          className="h-full rounded-full transition-all duration-1000"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function SalesDashboard({ cards }: { cards: Card[] }) {
  const stats = useMemo(() => {
    const collection = cards.filter((c) => c.status === 'collection');
    const aVendre = cards.filter((c) => c.status === 'a_vendre' && !c.is_listed);
    const enLigne = cards.filter((c) => c.status === 'a_vendre' && c.is_listed);
    const vendues = cards.filter((c) => c.status === 'vendu');

    const investTotal = cards.reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    const investVendues = vendues.reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    const encaisse = vendues.reduce((s, c) => s + (c.price ?? 0), 0);
    const margeReelle = encaisse - investVendues;
    const valeurEstimee = [...aVendre, ...enLigne].reduce((s, c) => s + (c.price ?? 0), 0);
    const investAVendre = [...aVendre, ...enLigne].reduce((s, c) => s + (c.purchase_price ?? 0), 0);
    const margePotentielle = valeurEstimee - investAVendre;
    const roi = investVendues > 0 ? (margeReelle / investVendues) * 100 : null;

    const now = new Date();
    const months: { label: string; total: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('fr-FR', { month: 'short' });
      const monthCards = vendues.filter((c) => {
        const cd = new Date(c.validated_at ?? c.created_at);
        return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
      });
      months.push({ label, total: monthCards.reduce((s, c) => s + (c.price ?? 0), 0), count: monthCards.length });
    }

    return {
      collection: collection.length,
      aVendre: aVendre.length,
      enLigne: enLigne.length,
      vendues: vendues.length,
      totalCards: cards.filter(c => c.status !== 'draft').length,
      investTotal, encaisse, margeReelle, valeurEstimee, margePotentielle, roi, months,
      hasInvest: investTotal > 0,
    };
  }, [cards]);

  const maxMonth = Math.max(...stats.months.map((m) => m.total), 1);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="Total Encaissé" value={fmt(stats.encaisse)} sub={`${stats.vendues} ventes`} icon={DollarSign} accent />
        <KpiCard
          label="Marge Réelle"
          value={stats.hasInvest ? fmt(stats.margeReelle) : '—'}
          sub={stats.roi !== null ? `ROI ${stats.roi.toFixed(0)}%` : 'Inv. Inconnu'}
          icon={TrendingUp}
          positive={stats.hasInvest ? stats.margeReelle >= 0 : undefined}
        />
        <KpiCard
          label="Valeur Listing"
          value={fmt(stats.valeurEstimee)}
          sub={`Sur ${stats.aVendre + stats.enLigne} cartes`}
          icon={Target}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="panel p-8 rounded-[40px] bg-white/[0.02] border border-white/5 space-y-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Pipeline de Vente</h3>
          <div className="space-y-5">
            <FunnelStage label="Collection" count={stats.collection} total={stats.totalCards} color="rgba(255,255,255,0.1)" icon={PackageOpen} />
            <FunnelStage label="En Préparation" count={stats.aVendre} total={stats.totalCards} color="var(--accent)" icon={Tag} />
            <FunnelStage label="Live" count={stats.enLigne} total={stats.totalCards} color="#6366f1" icon={Globe} />
            <FunnelStage label="Vendu" count={stats.vendues} total={stats.totalCards} color="#10b981" icon={CheckCircle2} />
          </div>
        </div>

        <div className="panel p-8 rounded-[40px] bg-white/[0.02] border border-white/5 flex flex-col justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-8">Performance Mensuelle</h3>
          <div className="flex items-end gap-3 h-32 flex-1 mb-4">
            {stats.months.map((m) => (
              <div key={m.label} className="flex-1 flex flex-col items-center gap-4 h-full justify-end group">
                <div className="w-full relative">
                  <AnimatePresence>
                    {m.total > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        whileHover={{ opacity: 1, y: 0 }}
                        className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-white text-black text-[9px] font-black whitespace-nowrap opacity-0 transition-opacity"
                      >
                        {m.total.toFixed(0)}€
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(m.total / maxMonth) * 100}%` }}
                    className={`w-full rounded-2xl transition-all ${m.total > 0 ? 'bg-[var(--accent)]' : 'bg-white/5'}`}
                  />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/20 group-hover:text-white transition-colors">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest text-white/40">
            <LineChart size={12} />
            Données synchronisées live
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceInput({ card, onSave }: { card: Card; onSave: (price: number) => void }) {
  const [value, setValue] = useState(card.price?.toString() ?? '');
  const [editing, setEditing] = useState(card.price == null);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="px-3 py-1.5 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent)] text-xs font-black"
      >
        {card.price} €
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseFloat(value);
        if (!isNaN(n) && n > 0) { onSave(n); setEditing(false); }
      }}
      className="flex items-center gap-1"
    >
      <input
        autoFocus
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 rounded-xl px-3 py-1.5 text-xs font-black bg-white/5 border border-white/10 text-white outline-none focus:border-[var(--accent)]"
      />
      <button type="submit" className="p-1.5 rounded-xl bg-[var(--accent)] text-black">
        <Check size={14} />
      </button>
    </form>
  );
}

function SalesCard({ card, tab, onUpdate, onClick }: { card: Card; tab: SalesTab; onUpdate: (id: string, fields: Partial<Card>) => void; onClick: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel p-4 rounded-[32px] bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all group active:scale-[0.99] flex items-center gap-5">
      <button onClick={onClick} className="w-16 h-20 rounded-2xl bg-white/5 border border-white/5 overflow-hidden shrink-0 relative">
        {card.image_front_url ? (
          <img src={card.image_front_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20"><PackageOpen size={24} /></div>
        )}
      </button>

      <div onClick={onClick} className="flex-1 min-w-0 cursor-pointer">
        <h3 className="text-sm font-black text-white tracking-tight truncate mb-1">{card.player ?? 'Anonyme'}</h3>
        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest truncate">
          {[card.year, card.brand, card.set_name].filter(Boolean).slice(0, 2).join(' · ')}
        </p>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {tab === 'a_traiter' && (
          <>
            <PriceInput card={card} onSave={(price) => onUpdate(card.id, { price })} />
            <button
              onClick={() => onUpdate(card.id, { listing_validated: true })}
              disabled={card.price == null}
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
            >
              <ArrowUpRight size={18} />
            </button>
          </>
        )}

        {tab === 'pret' && (
          <>
            <div className="text-right">
              <div className="text-sm font-black text-[var(--accent)] tracking-tighter">{card.price}€</div>
              <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-1">Générer Listing</div>
            </div>
            <button
              onClick={() => onUpdate(card.id, { is_listed: true })}
              className="w-10 h-10 rounded-xl bg-[var(--accent)] text-black flex items-center justify-center shadow-lg shadow-[var(--accent-glow)] active:scale-90 transition-all"
            >
              <Check size={18} />
            </button>
          </>
        )}

        {(tab === 'en_ligne' || tab === 'vendu') && (
          <div className="text-right">
            <div className={`text-base font-black tracking-tighter ${tab === 'vendu' ? 'text-green-400' : 'text-white'}`}>
              {card.price}€
            </div>
            {tab === 'en_ligne' ? (
              <button onClick={() => onUpdate(card.id, { status: 'vendu', is_listed: false })} className="text-[9px] font-black text-[var(--accent)] uppercase tracking-widest mt-1 hover:brightness-125">Déclarer Vendu</button>
            ) : (
              <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-1">Archivé</div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function SalesView() {
  const { data: cards = [], isLoading } = useCards();
  const updateCard = useUpdateCard();
  const [tab, setTab] = useState<SalesTab>('stats');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const byTab = useMemo(() => ({
    a_traiter: cards.filter(c => c.status === 'a_vendre' && !c.listing_validated && !c.is_listed),
    pret: cards.filter(c => c.status === 'a_vendre' && c.listing_validated && !c.is_listed),
    en_ligne: cards.filter(c => c.status === 'a_vendre' && c.is_listed),
    vendu: cards.filter(c => c.status === 'vendu'),
  }), [cards]);

  const totalAVendre = byTab.a_traiter.length + byTab.pret.length + byTab.en_ligne.length;

  if (isLoading) return <div className="flex-1 flex items-center justify-center opacity-20"><RefreshCw className="animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-auto bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Finances & Marché</h2>
            <p className="text-sm text-[var(--text-muted)] font-medium">{totalAVendre} cartes actives en flux de vente</p>
          </div>
          <div className="flex p-1 rounded-2xl bg-white/5 border border-white/10">
            <button className="p-2 text-white/40 hover:text-white transition-colors"><Filter size={16} /></button>
          </div>
        </div>

        <div className="flex gap-2 p-1 rounded-[24px] bg-white/[0.04] border border-white/5 mb-10">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 group flex flex-col items-center py-3 rounded-2xl transition-all relative ${tab === t.key ? 'bg-white/10 shadow-xl' : 'hover:bg-white/5'
                }`}
            >
              <div className={`mb-1 transition-colors ${tab === t.key ? 'text-[var(--accent)]' : 'text-white/20'}`}>
                <t.icon size={16} />
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest ${tab === t.key ? 'text-white' : 'text-white/30'}`}>
                {t.label}
              </span>
              {t.key !== 'stats' && byTab[t.key as keyof typeof byTab].length > 0 && (
                <div className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-md bg-[var(--accent)] text-[8px] font-black text-black">
                  {byTab[t.key as keyof typeof byTab].length}
                </div>
              )}
            </button>
          ))}
        </div>

        <motion.div key={tab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          {tab === 'stats' && <SalesDashboard cards={cards} />}

          {tab !== 'stats' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-4 mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">{TABS.find(t => t.key === tab)?.description}</h3>
              </div>
              {byTab[tab as keyof typeof byTab].length === 0 ? (
                <div className="panel p-20 rounded-[40px] bg-white/[0.02] border border-white/5 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-[24px] bg-white/5 flex items-center justify-center text-white/10 mb-6">
                    <ShoppingBag size={32} />
                  </div>
                  <h3 className="text-lg font-black text-white/40 uppercase tracking-widest">File d'attente vide</h3>
                  <p className="text-sm text-white/20 mt-2">Aucune carte ne correspond à ce statut actuellement.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {byTab[tab as keyof typeof byTab].map(card => (
                    <SalesCard
                      key={card.id}
                      card={card}
                      tab={tab}
                      onUpdate={(id, f) => updateCard.mutateAsync({ id, ...f })}
                      onClick={() => setSelectedCard(card)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedCard && <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />}
      </AnimatePresence>
    </div>
  );
}
