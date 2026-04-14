import { useState } from 'react';
import { apiFetch } from '../../api/client';

interface EbaySoldResult {
  title: string;
  price: number;
  currency: string;
  url: string;
  image: string;
  condition: string;
  end_date: string;
  sale_type: string;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

interface EbayData {
  count?: number;
  min?: number | null;
  avg?: number | null;
  median?: number | null;
  results?: EbaySoldResult[];
  error?: string;
}

interface Props {
  query: string;
}

export function EbaySoldItems({ query }: Props) {
  const [data, setData] = useState<EbayData | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchSold() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const result = await apiFetch<EbayData>('/ebay/sold-items', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      setData(result);
    } catch (e) {
      setData({ error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={fetchSold}
        disabled={loading}
        className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          color: 'var(--text-secondary)',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          '⏳ Recherche eBay…'
        ) : (
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 100 40" width="40" height="16" aria-label="eBay">
              <text x="0" y="32" fontSize="40" fontWeight="bold" fontFamily="Arial, sans-serif">
                <tspan fill="#E53238">e</tspan>
                <tspan fill="#0064D2">B</tspan>
                <tspan fill="#F5AF02">a</tspan>
                <tspan fill="#86B817">y</tspan>
              </text>
            </svg>
            Annonces en cours
          </span>
        )}
      </button>

      {data && !loading && (
        <div
          className="rounded-xl p-3 flex flex-col gap-2"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          {data.error ? (
            <p className="text-xs" style={{ color: 'var(--red)' }}>{data.error}</p>
          ) : data.count === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Aucune vente trouvée sur eBay.</p>
          ) : (
            <>
              {/* Stats */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{data.count} résultats</span>
                <div className="flex gap-4">
                  {data.min != null && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Min <strong style={{ color: 'var(--green)' }}>${data.min}</strong>
                    </span>
                  )}
                  {data.avg != null && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Moy <strong style={{ color: 'var(--accent)' }}>${data.avg}</strong>
                    </span>
                  )}
                  {data.median != null && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Méd <strong style={{ color: 'var(--text-primary)' }}>${data.median}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Liste */}
              <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
                {data.results?.map((r, i) => (
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
                            background: r.sale_type === 'Enchère' ? 'rgba(59,130,246,0.1)' : 'rgba(245,166,35,0.1)',
                            color: r.sale_type === 'Enchère' ? 'var(--blue)' : 'var(--accent)',
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
