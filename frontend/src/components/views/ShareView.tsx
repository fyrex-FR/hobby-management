import { useEffect, useState } from 'react';
import type { Card } from '../../types';
import { CardBadge } from '../shared/CardBadge';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface ShareData {
  title: string | null;
  filter: string;
  show_prices: boolean;
  card_count: number;
  cards: Card[];
}

function SharedCard({ card, showPrice }: { card: Card; showPrice: boolean }) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <div
        className="group rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/60"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={() => setLightbox(true)}
      >
        {/* Image */}
        <div className="relative aspect-[3/4] overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)' }}>
          {card.image_front_url ? (
            <img
              src={card.image_front_url}
              alt={card.player ?? ''}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">🃏</div>
          )}

          {/* Badges overlay */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {(card.card_type === 'auto' || card.card_type === 'auto_patch') && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(16,185,129,0.9)', color: '#fff' }}>AUTO</span>
            )}
            {(card.card_type === 'patch' || card.card_type === 'auto_patch') && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(239,68,68,0.9)', color: '#fff' }}>PATCH</span>
            )}
            {card.numbered && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(245,166,35,0.9)', color: '#000' }}>{card.numbered}</span>
            )}
            {card.grading_grade && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(99,102,241,0.9)', color: '#fff' }}>
                {card.grading_company ?? 'PSA'} {card.grading_grade}
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-3">
          <p className="font-bold text-sm truncate text-white">{card.player ?? '—'}</p>
          <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {[card.year, card.brand, card.set_name].filter(Boolean).join(' · ')}
          </p>
          {(card.insert_name || (card.parallel_name && card.parallel_name !== 'Base')) && (
            <p className="text-xs truncate mt-0.5" style={{ color: '#F5AF23' }}>
              {card.insert_name || card.parallel_name}
            </p>
          )}
          <div className="flex items-center justify-between mt-2">
            <CardBadge type={card.card_type} />
            {showPrice && card.price != null && (
              <span className="text-sm font-bold text-white">{card.price} €</span>
            )}
          </div>
          {card.vinted_url && (
            <a
              href={card.vinted_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all hover:opacity-90"
              style={{ background: 'rgba(9,182,109,0.15)', color: 'rgb(9,182,109)', border: '1px solid rgba(9,182,109,0.25)' }}
            >
              Acheter sur Vinted ↗
            </a>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightbox(false)}
        >
          <div className="flex gap-4 items-center p-4" onClick={(e) => e.stopPropagation()}>
            {card.image_front_url && (
              <img src={card.image_front_url} alt="Face"
                className="max-h-[80vh] max-w-[45vw] rounded-2xl object-contain shadow-2xl" />
            )}
            {card.image_back_url && (
              <img src={card.image_back_url} alt="Dos"
                className="max-h-[80vh] max-w-[45vw] rounded-2xl object-contain shadow-2xl opacity-80" />
            )}
          </div>
          <button
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-sm"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
            onClick={() => setLightbox(false)}
          >✕</button>
        </div>
      )}
    </>
  );
}

const FILTER_LABELS: Record<string, string> = {
  all: 'Collection complète',
  collection: 'Collection',
  a_vendre: 'À vendre',
};

export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/share/${token}/view`)
      .then((r) => {
        if (!r.ok) throw new Error('Lien introuvable ou expiré');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0E0E11' }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #F5AF23 0%, #E8920A 100%)', color: '#0E0E11' }}>N</div>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Chargement…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0E0E11' }}>
        <div className="text-center space-y-3">
          <p className="text-5xl">🔗</p>
          <p className="text-white font-semibold">Lien introuvable</p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Ce lien n'existe pas ou a été supprimé.</p>
        </div>
      </div>
    );
  }

  const TYPE_ORDER = ['auto_patch', 'auto', 'patch', 'numbered', 'parallel', 'insert', 'base'];
  const sorted = [...data.cards].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a.card_type ?? 'base');
    const bi = TYPE_ORDER.indexOf(b.card_type ?? 'base');
    return ai - bi;
  });

  return (
    <div className="min-h-screen" style={{ background: '#0E0E11' }}>
      {/* Hero header */}
      <div className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(ellipse, #F5AF23 0%, transparent 70%)' }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
              style={{ background: 'linear-gradient(135deg, #F5AF23 0%, #E8920A 100%)', color: '#0E0E11', boxShadow: '0 0 24px rgba(245,175,35,0.4)' }}>
              N
            </div>
            <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>NBA Card Studio</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
            {data.title || FILTER_LABELS[data.filter] || 'Ma collection'}
          </h1>

          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {data.card_count} carte{data.card_count !== 1 ? 's' : ''}
            </span>

            {/* Mini stats */}
            {(() => {
              const autos = data.cards.filter((c) => c.card_type === 'auto' || c.card_type === 'auto_patch').length;
              const numbered = data.cards.filter((c) => c.numbered).length;
              const graded = data.cards.filter((c) => c.grading_grade).length;
              return (
                <>
                  {autos > 0 && (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg"
                      style={{ background: 'rgba(16,185,129,0.12)', color: 'rgb(16,185,129)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      {autos} auto{autos > 1 ? 's' : ''}
                    </span>
                  )}
                  {numbered > 0 && (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg"
                      style={{ background: 'rgba(245,166,35,0.12)', color: '#F5AF23', border: '1px solid rgba(245,166,35,0.2)' }}>
                      {numbered} numérotée{numbered > 1 ? 's' : ''}
                    </span>
                  )}
                  {graded > 0 && (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg"
                      style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
                      {graded} gradée{graded > 1 ? 's' : ''}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <span className="text-4xl opacity-20">🃏</span>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Aucune carte dans cette collection.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sorted.map((card) => (
              <SharedCard key={card.id} card={card} showPrice={data.show_prices} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t mt-12 py-6 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Partagé via <span style={{ color: 'rgba(255,255,255,0.4)' }}>NBA Card Studio</span>
        </p>
      </div>
    </div>
  );
}
