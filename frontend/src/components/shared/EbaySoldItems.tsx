import { useState } from 'react';
import { apiFetch } from '../../api/client';
import { cdnImg } from '../../lib/cdn';

interface EbayResult {
  title: string;
  price: number;
  currency: string;
  url: string;
  image: string;
  condition: string;
  end_date: string;
  sale_type: string;
  epid?: string;
  item_id?: string;
}

interface EbayData {
  count?: number;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  median?: number | null;
  results?: EbayResult[];
  error?: string;
  detail?: string;
  needs_approval?: boolean;
  source?: string;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function EbayLogo() {
  return (
    <svg viewBox="0 0 100 40" width="40" height="16" aria-label="eBay">
      <text x="0" y="32" fontSize="40" fontWeight="bold" fontFamily="Arial, sans-serif">
        <tspan fill="#E53238">e</tspan>
        <tspan fill="#0064D2">B</tspan>
        <tspan fill="#F5AF02">a</tspan>
        <tspan fill="#86B817">y</tspan>
      </text>
    </svg>
  );
}

async function urlToBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Image inaccessible');
  const blob = await resp.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error('Conversion image impossible');
  return match[1];
}

interface MatchInfo {
  year?: string | null;
  cardNumber?: string | null;
  numbered?: string | null;
  setName?: string | null;
}

/** Vrai si `title` contient le nombre `n` isolé (pas 133 pour 33, pas 1490 pour 149). */
function titleHasNumber(title: string, n: string): boolean {
  const digits = n.replace(/[^0-9]/g, '');
  if (!digits) return false;
  return new RegExp(`(^|[^0-9])0*${digits}([^0-9]|$)`).test(title);
}

/** Ne garde que les ventes qui correspondent vraiment à la carte (n° + tirage + année). */
function filterRelevant(results: EbayResult[], m?: MatchInfo): EbayResult[] {
  if (!m) return results;
  const preds: Array<(t: string) => boolean> = [];

  const year4 = m.year ? (m.year.match(/\d{4}/)?.[0] ?? '') : '';
  if (year4) preds.push((t) => titleHasNumber(t, year4));
  if (m.cardNumber) preds.push((t) => titleHasNumber(t, m.cardNumber!));

  // Tirage /149 : discriminant fort de parallèle. Sinon, on retombe sur le set.
  const denom = m.numbered ? (m.numbered.match(/(\d+)\s*$/)?.[1] ?? '') : '';
  if (denom) {
    preds.push((t) => titleHasNumber(t, denom));
  } else if (m.setName) {
    const set = m.setName.toLowerCase();
    preds.push((t) => t.toLowerCase().includes(set));
  }

  if (!preds.length) return results;
  // Précision avant tout : si rien ne matche, on renvoie vide (le bouton
  // « Voir tout » permet de retrouver l'ensemble non filtré).
  return results.filter((r) => preds.every((p) => p(r.title)));
}

function computeStats(results: EbayResult[]) {
  const prices = results.map((r) => r.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (!prices.length) return null;
  const n = prices.length;
  const median = n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2;
  return {
    count: n,
    min: Math.round(prices[0] * 100) / 100,
    max: Math.round(prices[n - 1] * 100) / 100,
    median: Math.round(median * 100) / 100,
  };
}

// Prix de vente proposé à partir des ventes eBay. Pas de conversion $→€
// (1 $ = 1 €), juste un arrondi à l'euro pour un prix propre.
function toEurPrice(usd: number): number {
  return Math.max(1, Math.round(usd));
}

interface Props {
  query: string;
  /** URL de la photo recto — active la recherche visuelle eBay. */
  imageUrl?: string | null;
  /** Attributs de la carte pour filtrer les ventes non pertinentes. */
  match?: MatchInfo;
  /** Prix de vente actuel de la carte (€). */
  currentPrice?: number | null;
  /** Applique un prix de vente (€) à la carte. */
  onApplyPrice?: (eur: number) => void | Promise<unknown>;
}

/** Mini-graphe SVG de la tendance des ventes (prix dans le temps) + %. */
function SalesTrend({ sales }: { sales: EbayResult[] }) {
  const pts = sales
    .map((s) => ({ t: new Date(s.end_date).getTime(), p: s.price }))
    .filter((d) => Number.isFinite(d.t) && d.p > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 3) return null;

  const t0 = pts[0].t;
  const xs = pts.map((d) => (d.t - t0) / 86400000); // jours
  const ys = pts.map((d) => d.p);
  const n = pts.length;
  const sx = xs.reduce((s, v) => s + v, 0);
  const sy = ys.reduce((s, v) => s + v, 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const denom = n * sxx - sx * sx;
  const a = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const b = (sy - a * sx) / n;
  const xMax = xs[n - 1] || 1;
  const startP = b;
  const endP = a * xMax + b;
  const trendPct = startP > 0 ? ((endP - startP) / startP) * 100 : 0;
  const up = trendPct >= 0;
  const color = up ? 'var(--green)' : 'var(--red)';

  const W = 300, H = 84, pad = 8;
  const pMin = Math.min(...ys), pMax = Math.max(...ys);
  const pRange = pMax - pMin || 1;
  const cx = (x: number) => pad + (x / xMax) * (W - 2 * pad);
  const cy = (p: number) => H - pad - ((p - pMin) / pRange) * (H - 2 * pad);

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase font-black tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Tendance · {n} ventes
        </span>
        <span className="text-xs font-black" style={{ color }}>
          {up ? '↗' : '↘'} {up ? '+' : ''}{trendPct.toFixed(0)} %
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 64 }} preserveAspectRatio="none">
        <line x1={cx(0)} y1={cy(startP)} x2={cx(xMax)} y2={cy(endP)} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {pts.map((d, i) => (
          <circle key={i} cx={cx(xs[i])} cy={cy(d.p)} r={3} fill="var(--accent)" />
        ))}
      </svg>
    </div>
  );
}

export function EbaySoldItems({ query, imageUrl, match, currentPrice, onApplyPrice }: Props) {
  const [effectiveQuery, setEffectiveQuery] = useState(query);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [appliedPrice, setAppliedPrice] = useState<number | null>(null);
  const [customPrice, setCustomPrice] = useState('');

  // Recherche visuelle
  const [visual, setVisual] = useState<EbayData | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);

  // Prix (onglets)
  const [tab, setTab] = useState<'sold' | 'active'>('sold');
  const [sold, setSold] = useState<EbayData | null>(null);
  const [active, setActive] = useState<EbayData | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  async function fetchVisual() {
    if (!imageUrl) return;
    setVisualLoading(true);
    try {
      const image_base64 = await urlToBase64(cdnImg(imageUrl) || imageUrl);
      const result = await apiFetch<EbayData>('/ebay/visual-match', {
        method: 'POST',
        body: JSON.stringify({ image_base64 }),
      });
      setVisual(result);
    } catch (e) {
      setVisual({ error: (e as Error).message });
    } finally {
      setVisualLoading(false);
    }
  }

  async function fetchPrices(q: string) {
    setPriceLoading(true);
    setSold(null);
    setActive(null);
    try {
      const [soldRes, activeRes] = await Promise.all([
        apiFetch<EbayData>('/ebay/sold-items', {
          method: 'POST',
          body: JSON.stringify({ query: q }),
        }),
        apiFetch<EbayData>('/ebay/active-items', {
          method: 'POST',
          body: JSON.stringify({ query: q }),
        }),
      ]);
      setSold(soldRes);
      setActive(activeRes);
    } catch (e) {
      const err = { error: (e as Error).message };
      setSold(err);
      setActive(err);
    } finally {
      setPriceLoading(false);
    }
  }

  function selectVisual(r: EbayResult) {
    setSelectedTitle(r.title);
    setEffectiveQuery(r.title);
    fetchPrices(r.title);
  }

  const current = tab === 'sold' ? sold : active;
  const hasPrices = sold != null || active != null;

  // Filtrage de pertinence (n° + tirage + année) + stats recalculées dessus.
  const soldShown = sold?.results ? (showAll ? sold.results : filterRelevant(sold.results, match)) : [];
  const activeShown = active?.results ? (showAll ? active.results : filterRelevant(active.results, match)) : [];
  const soldStats = computeStats(soldShown);
  const activeStats = computeStats(activeShown);
  const currentShown = tab === 'sold' ? soldShown : activeShown;
  const currentRawCount = current?.results?.length ?? 0;
  const filteredOut = !showAll && currentRawCount > currentShown.length;

  return (
    <div className="flex flex-col gap-2">
      {/* --- Recherche visuelle --- */}
      {imageUrl && !selectedTitle && (
        <button
          onClick={fetchVisual}
          disabled={visualLoading}
          className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            opacity: visualLoading ? 0.6 : 1,
          }}
        >
          {visualLoading ? (
            '🔍 Identification visuelle…'
          ) : (
            <span className="flex items-center gap-2">
              <EbayLogo /> Correspondances visuelles
            </span>
          )}
        </button>
      )}

      {visual && !selectedTitle && (
        <div
          className="rounded-xl p-3 flex flex-col gap-2"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          {visual.error ? (
            <p className="text-xs" style={{ color: 'var(--red)' }}>{visual.error}</p>
          ) : !visual.results?.length ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucune correspondance visuelle.</p>
          ) : (
            <>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Tape la carte qui correspond pour voir ses prix
              </p>
              <div className="grid grid-cols-3 gap-2">
                {visual.results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => selectVisual(r)}
                    className="flex flex-col gap-1 rounded-lg overflow-hidden transition-transform active:scale-95 hover:opacity-90 text-left"
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
                  >
                    {r.image && (
                      <img src={r.image} alt="" className="w-full aspect-[3/4] object-cover" />
                    )}
                    <div className="px-1.5 pb-1.5">
                      <p className="text-[10px] leading-tight line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                        {r.title}
                      </p>
                      <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
                        ${r.price}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* --- Déclencheur prix (recherche texte, sans passer par la grille) --- */}
      {!hasPrices && (
        <button
          onClick={() => fetchPrices(effectiveQuery)}
          disabled={priceLoading}
          className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            opacity: priceLoading ? 0.6 : 1,
          }}
        >
          {priceLoading ? (
            '⏳ Recherche eBay…'
          ) : (
            <span className="flex items-center gap-2">
              <EbayLogo /> Voir les ventes
            </span>
          )}
        </button>
      )}

      {/* --- Panneau prix --- */}
      {hasPrices && (
        <div
          className="rounded-xl p-3 flex flex-col gap-3"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          {selectedTitle && (
            <div className="flex items-center gap-2">
              <p className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                ✓ {selectedTitle}
              </p>
              <button
                onClick={() => { setSelectedTitle(null); setEffectiveQuery(query); setSold(null); setActive(null); }}
                className="text-[11px] shrink-0"
                style={{ color: 'var(--text-muted)' }}
              >
                Changer
              </button>
            </div>
          )}

          {/* Médiane / min / max (onglet Vendues prioritaire), sur données filtrées */}
          {(() => {
            const usingSold = soldStats != null;
            const stats = usingSold ? soldStats : activeStats;
            if (!stats) return null;
            // Libellé honnête : « ventes » seulement quand la donnée vient du vendu.
            const statsLabel = usingSold ? 'Médiane des ventes' : 'Médiane des annonces en cours';
            return (
              <div className="flex flex-col gap-2">
                <div
                  className="rounded-xl py-3 text-center"
                  style={{ background: 'rgba(59,130,246,0.08)' }}
                >
                  <div className="text-[10px] uppercase font-black tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {statsLabel}
                  </div>
                  <div className="text-3xl font-black" style={{ color: 'var(--blue)' }}>
                    ${stats.median}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl py-2 text-center" style={{ background: 'rgba(34,197,94,0.08)' }}>
                    <div className="text-[10px] uppercase font-black" style={{ color: 'var(--text-muted)' }}>Min</div>
                    <div className="text-lg font-black" style={{ color: 'var(--green)' }}>${stats.min}</div>
                  </div>
                  <div className="rounded-xl py-2 text-center" style={{ background: 'rgba(239,68,68,0.08)' }}>
                    <div className="text-[10px] uppercase font-black" style={{ color: 'var(--text-muted)' }}>Max</div>
                    <div className="text-lg font-black" style={{ color: 'var(--red)' }}>${stats.max}</div>
                  </div>
                </div>

                {/* Définir le prix de vente à partir de la médiane */}
                {usingSold && onApplyPrice && (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-black tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        Définir le prix de vente
                      </span>
                      {(appliedPrice ?? currentPrice) != null && (
                        <span className="text-[11px]" style={{ color: appliedPrice != null ? 'var(--green)' : 'var(--text-muted)' }}>
                          {appliedPrice != null ? '✓ ' : 'Actuel : '}{appliedPrice ?? currentPrice} €
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Médiane', mult: 1 },
                        { label: '+15%', mult: 1.15 },
                        { label: '+20%', mult: 1.2 },
                      ].map(({ label, mult }) => {
                        const eur = toEurPrice(stats.median * mult);
                        return (
                          <button
                            key={label}
                            onClick={async () => { if (!onApplyPrice) return; setAppliedPrice(eur); await onApplyPrice(eur); }}
                            className="flex flex-col items-center py-2 rounded-xl transition-all active:scale-95"
                            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
                          >
                            <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{label}</span>
                            <span className="text-sm font-black" style={{ color: 'var(--accent)' }}>{eur} €</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Prix libre */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder="Autre prix (€)"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      />
                      <button
                        disabled={!customPrice || !(Number(customPrice) > 0)}
                        onClick={async () => {
                          if (!onApplyPrice) return;
                          const v = Math.round(Number(customPrice));
                          if (!(v > 0)) return;
                          setAppliedPrice(v);
                          setCustomPrice('');
                          await onApplyPrice(v);
                        }}
                        className="px-4 py-2 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-40"
                        style={{ background: 'var(--accent)', color: '#09090B' }}
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Onglets */}
          <div className="flex gap-2">
            {(['sold', 'active'] as const).map((t) => {
              const d = t === 'sold' ? sold : active;
              const shownCount = t === 'sold' ? soldShown.length : activeShown.length;
              const label = t === 'sold' ? 'Vendues' : 'En vente';
              const n = d?.results ? shownCount : d?.count;
              const isActive = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: isActive ? 'var(--accent)' : 'var(--bg-primary)',
                    color: isActive ? '#09090B' : 'var(--text-secondary)',
                  }}
                >
                  {label}{n != null ? ` (${n})` : ''}
                </button>
              );
            })}
          </div>

          {/* Filtre pertinence : info + bascule */}
          {(filteredOut || showAll) && currentRawCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {showAll
                  ? `Tout affiché (${currentRawCount})`
                  : `${currentShown.length} pertinentes sur ${currentRawCount}`}
              </span>
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-[11px] font-semibold"
                style={{ color: 'var(--accent)' }}
              >
                {showAll ? 'Filtrer' : 'Voir tout'}
              </button>
            </div>
          )}

          {/* Contenu onglet */}
          {current?.needs_approval ? (
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              ⏳ Les ventes réelles arrivent via l'API eBay Marketplace Insights,
              en attente d'approbation de l'application par eBay. En attendant,
              l'onglet « En vente » affiche les annonces en cours.
            </p>
          ) : current?.error ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs" style={{ color: 'var(--red)' }}>{current.error}</p>
              {current.detail && (
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{current.detail}</p>
              )}
            </div>
          ) : currentShown.length === 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {filteredOut
                  ? 'Aucune vente correspondant exactement à cette carte. Essaie « Voir tout ».'
                  : 'Aucun résultat sur eBay.'}
              </p>
              {current?.detail && (
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{current.detail}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tab === 'sold' && <SalesTrend sales={soldShown} />}
              <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
              {tab === 'sold' && current?.source === 'scrape' && (
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Ventes réelles issues des annonces terminées eBay
                </p>
              )}
              {currentShown.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg transition-colors hover:bg-white/5"
                >
                  {r.image && (
                    <img src={r.image} alt="" className="w-12 h-16 object-cover rounded-lg shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug" style={{ color: 'var(--text-secondary)' }}>
                      {r.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {r.condition && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                          {r.condition}
                        </span>
                      )}
                      {r.sale_type && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded" style={{
                          background: r.sale_type === 'Enchère' ? 'rgba(59,130,246,0.1)' : r.sale_type === 'Vendu' ? 'rgba(34,197,94,0.1)' : 'rgba(245,166,35,0.1)',
                          color: r.sale_type === 'Enchère' ? 'var(--blue)' : r.sale_type === 'Vendu' ? 'var(--green)' : 'var(--accent)',
                        }}>
                          {r.sale_type}
                        </span>
                      )}
                      {r.end_date && (
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {formatDate(r.end_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-base font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
                    ${r.price}
                  </span>
                </a>
              ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
