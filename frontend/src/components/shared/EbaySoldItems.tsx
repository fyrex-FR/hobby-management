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

interface Props {
  query: string;
  /** URL de la photo recto — active la recherche visuelle eBay. */
  imageUrl?: string | null;
}

export function EbaySoldItems({ query, imageUrl }: Props) {
  const [effectiveQuery, setEffectiveQuery] = useState(query);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

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

          {/* Médiane / min / max (onglet Vendues prioritaire) */}
          {(() => {
            const usingSold = sold?.median != null;
            const stats = usingSold ? sold : active;
            if (!stats || stats.median == null) return null;
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
              </div>
            );
          })()}

          {/* Onglets */}
          <div className="flex gap-2">
            {(['sold', 'active'] as const).map((t) => {
              const d = t === 'sold' ? sold : active;
              const label = t === 'sold' ? 'Vendues' : 'En vente';
              const n = d?.count;
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
          ) : current?.count === 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucun résultat sur eBay.</p>
              {current.detail && (
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{current.detail}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
              {tab === 'sold' && current?.source === 'scrape' && (
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Ventes réelles issues des annonces terminées eBay
                </p>
              )}
              {current?.results?.map((r, i) => (
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
          )}
        </div>
      )}
    </div>
  );
}
