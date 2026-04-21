import { useState } from 'react';
import { apiFetch } from '../api/client';

interface VintedPriceResult {
  count: number;
  min: number | null;
  avg: number | null;
  median: number | null;
  results: { title: string; price: number; url: string; image: string }[];
  error?: string;
}

export function useVintedPrice() {
  const [data, setData] = useState<VintedPriceResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function estimate(query: string) {
    setLoading(true);
    setData(null);
    try {
      const json = await apiFetch<VintedPriceResult>('/vinted/price-estimate', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
      setData(json);
    } catch (e) {
      setData({ count: 0, min: null, avg: null, median: null, results: [], error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, estimate };
}
