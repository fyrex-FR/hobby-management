import { useState, useEffect } from 'react';
import { apiFetch } from '../../api/client';

interface ShareLink {
  id: string;
  token: string;
  filter: string;
  show_prices: boolean;
  title: string | null;
  created_at: string;
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'Toute la collection', desc: 'Collection + À vendre' },
  { value: 'collection', label: 'Collection uniquement', desc: 'Statut "Collection"' },
  { value: 'a_vendre', label: 'À vendre uniquement', desc: 'Statut "À vendre"' },
];

function buildShareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

function LinkRow({ link, onDelete }: { link: ShareLink; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const url = buildShareUrl(link.token);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    setDeleting(true);
    await apiFetch(`/share/${link.id}`, { method: 'DELETE' });
    onDelete();
  }

  const filterLabel = FILTER_OPTIONS.find((o) => o.value === link.filter)?.label ?? link.filter;

  return (
    <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {link.title || filterLabel}
        </p>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
          {filterLabel} · {link.show_prices ? 'Prix visibles' : 'Prix masqués'}
        </p>
        <p className="text-[10px] mt-1 truncate font-mono" style={{ color: 'var(--text-muted)' }}>{url}</p>
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
        style={copied
          ? { background: 'rgba(16,185,129,0.15)', color: 'rgb(16,185,129)', border: '1px solid rgba(16,185,129,0.3)' }
          : { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
        }
      >
        {copied ? '✓ Copié' : 'Copier'}
      </button>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-xs transition-colors"
        style={{ border: '1px solid rgba(240,77,77,0.2)', color: 'var(--red)', opacity: deleting ? 0.4 : 1 }}
      >
        🗑
      </button>
    </div>
  );
}

export function ShareModal({ onClose }: { onClose: () => void }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newFilter, setNewFilter] = useState('all');
  const [newShowPrices, setNewShowPrices] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [justCreated, setJustCreated] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<ShareLink[]>('/share/my')
      .then(setLinks)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    const created = await apiFetch<ShareLink>('/share', {
      method: 'POST',
      body: JSON.stringify({ filter: newFilter, show_prices: newShowPrices, title: newTitle || null }),
    });
    setLinks((prev) => [created, ...prev]);
    setJustCreated(created);
    setNewTitle('');
    setCreating(false);
  }

  async function handleCopyNew() {
    if (!justCreated) return;
    await navigator.clipboard.writeText(buildShareUrl(justCreated.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputCls = 'w-full rounded-lg px-2.5 py-1.5 text-sm outline-none transition-all';
  const inputStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        style={{ background: 'var(--bg-primary)', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Partager ma collection</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Génère un lien public accessible sans connexion</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Create form */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Nouveau lien</p>

            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Titre (optionnel)</label>
              <input
                className={inputCls} style={inputStyle}
                placeholder="ex: Ma collection NBA 2024-25"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Quelles cartes ?</label>
              <div className="space-y-1.5">
                {FILTER_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: newFilter === opt.value ? 'rgba(245,166,35,0.08)' : 'var(--bg-elevated)',
                      border: `1px solid ${newFilter === opt.value ? 'rgba(245,166,35,0.3)' : 'var(--border)'}`,
                    }}>
                    <input type="radio" name="filter" value={opt.value} checked={newFilter === opt.value}
                      onChange={() => setNewFilter(opt.value)} className="accent-[var(--accent)]" />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <input type="checkbox" checked={newShowPrices} onChange={(e) => setNewShowPrices(e.target.checked)} className="accent-[var(--accent)]" />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Afficher les prix</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Les visiteurs verront tes prix de vente</p>
              </div>
            </label>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: creating ? 'var(--bg-elevated)' : 'var(--accent)', color: creating ? 'var(--text-muted)' : '#0E0E11', opacity: creating ? 0.7 : 1 }}
            >
              {creating ? 'Génération…' : 'Générer le lien'}
            </button>

            {/* Just created — highlight */}
            {justCreated && (
              <div className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold mb-0.5" style={{ color: 'rgb(16,185,129)' }}>Lien créé !</p>
                  <p className="text-xs truncate font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {buildShareUrl(justCreated.token)}
                  </p>
                </div>
                <button
                  onClick={handleCopyNew}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={copied
                    ? { background: 'rgba(16,185,129,0.2)', color: 'rgb(16,185,129)' }
                    : { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                  }
                >
                  {copied ? '✓' : 'Copier'}
                </button>
              </div>
            )}
          </div>

          {/* Existing links */}
          {!loading && links.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Liens actifs ({links.length})
              </p>
              {links.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  onDelete={() => setLinks((prev) => prev.filter((l) => l.id !== link.id))}
                />
              ))}
            </div>
          )}

          {loading && (
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
          )}
        </div>
      </div>
    </div>
  );
}
