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
        {loading ? '⏳ Recherche eBay…' : '🔍 Dernières ventes eBay'}
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
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{data.count} résultats</span>
                <div className="flex gap-3">
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
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {data.results?.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors hover:bg-white/5"
                  >
                    {r.image && (
                      <img src={r.image} alt="" className="w-8 h-10 object-cover rounded shrink-0" />
                    )}
                    <span className="truncate flex-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {r.title}
                    </span>
                    <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>
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
