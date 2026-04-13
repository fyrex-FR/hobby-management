import { useState } from 'react';
import { supabase } from '../lib/supabase';

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
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const resp = await fetch('/api/vinted/price-estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query }),
      });
      const json = await resp.json();
      setData(json);
    } catch (e) {
      setData({ count: 0, min: null, avg: null, median: null, results: [], error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, estimate };
}
