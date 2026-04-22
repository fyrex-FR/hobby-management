import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Share2,
  Link2,
  Copy,
  Check,
  Trash2,
  X,
  Eye,
  EyeOff,
  Plus,
  Globe,
  Settings2,
  ExternalLink,
  ClipboardCheck
} from 'lucide-react';
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
    try {
      await apiFetch(`/share/${link.id}`, { method: 'DELETE' });
      onDelete();
    } catch (e) {
      setDeleting(false);
    }
  }

  const filterLabel = FILTER_OPTIONS.find((o) => o.value === link.filter)?.label ?? link.filter;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative rounded-2xl p-4 flex items-center gap-4 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all"
    >
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/20 shrink-0 group-hover:text-[var(--accent)] transition-colors">
        <Globe size={18} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-black text-white truncate line-height-tight">
            {link.title || filterLabel}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {link.show_prices ? (
              <div className="px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-400 text-[8px] font-black uppercase tracking-widest border border-green-500/20">
                Prix
              </div>
            ) : (
              <div className="px-1.5 py-0.5 rounded-md bg-white/5 text-white/30 text-[8px] font-black uppercase tracking-widest border border-white/5">
                Privé
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide">
            {filterLabel}
          </p>
          <span className="text-[var(--text-muted)] opacity-20 text-[10px]">·</span>
          <p className="text-[10px] text-white/20 truncate font-mono tracking-tight">{link.token}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleCopy}
          className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90 ${copied
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-white/5 border border-white/5 text-white/40 hover:text-white hover:bg-white/10'
            }`}
        >
          {copied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/5 text-white/20 hover:text-red-400 hover:bg-red-400/10 hover:border-red-400/20 transition-all active:scale-90 disabled:opacity-20"
        >
          {deleting ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Trash2 size={16} />}
        </button>
      </div>
    </motion.div>
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
    try {
      const created = await apiFetch<ShareLink>('/share', {
        method: 'POST',
        body: JSON.stringify({ filter: newFilter, show_prices: newShowPrices, title: newTitle || null }),
      });
      setLinks((prev) => [created, ...prev]);
      setJustCreated(created);
      setNewTitle('');
      setCreating(false);
    } catch (e) {
      setCreating(false);
    }
  }

  async function handleCopyNew() {
    if (!justCreated) return;
    await navigator.clipboard.writeText(buildShareUrl(justCreated.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputCls = 'w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all bg-white/5 border border-white/10 focus:border-[var(--accent)]/50 focus:bg-white/10 text-white placeholder:text-white/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="panel relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-[40px] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-dim)] border border-[var(--border-accent)] flex items-center justify-center text-[var(--accent)]">
              <Share2 size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Portails Communautaires</h2>
              <p className="text-xs font-medium text-[var(--text-muted)]">Partagez votre passion avec le monde</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-8 space-y-10 custom-scrollbar">
          {/* Create Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 ml-1">
              <Plus size={12} className="text-[var(--accent)]" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Générer un nouveau lien</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#52525B] ml-1">Titre de la galerie</label>
                <input
                  className={inputCls}
                  placeholder="ex: Mes Hits 2024-25"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#52525B] ml-1">Configuration Prix</label>
                <button
                  onClick={() => setNewShowPrices(!newShowPrices)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${newShowPrices
                    ? 'bg-green-500/10 border-green-500/20 text-green-400'
                    : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    {newShowPrices ? <Eye size={14} /> : <EyeOff size={14} />}
                    <span className="text-xs font-black uppercase tracking-widest">{newShowPrices ? 'Prix Visibles' : 'Prix Masqués'}</span>
                  </div>
                  <div className={`w-8 h-4 rounded-full relative ${newShowPrices ? 'bg-green-500' : 'bg-white/10'}`}>
                    <div className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white transition-all ${newShowPrices ? 'right-1' : 'right-4.5 opacity-30'}`} />
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-black uppercase tracking-widest text-[#52525B] ml-1">Sélection du contenu</label>
              <div className="grid sm:grid-cols-3 gap-3">
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setNewFilter(opt.value)}
                    className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left group ${newFilter === opt.value
                      ? 'bg-[var(--accent-dim)] border-[var(--border-accent)]'
                      : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                      }`}
                  >
                    <div className={`text-xs font-black uppercase tracking-widest mb-1 ${newFilter === opt.value ? 'text-[var(--accent)]' : 'text-white'}`}>{opt.label}</div>
                    <div className="text-[9px] font-bold text-white/30 leading-tight">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full py-4 rounded-2xl bg-[var(--accent)] border border-[var(--border-accent)] text-[#09090B] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-[var(--accent-glow)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {creating ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Link2 size={18} />}
              {creating ? 'Génération en cours…' : 'Créer le portail public'}
            </button>

            {/* Success Animation Area */}
            <AnimatePresence>
              {justCreated && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: 10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: 10 }}
                  className="rounded-3xl p-5 bg-green-500/10 border border-green-500/20 flex flex-col gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 text-black flex items-center justify-center">
                      <Check size={18} strokeWidth={3} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-green-400 uppercase tracking-widest">Lien prêt à partager !</p>
                      <p className="text-[11px] font-mono text-white/60 truncate max-w-[280px]">{buildShareUrl(justCreated.token)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyNew}
                      className="flex-1 py-2.5 rounded-xl bg-green-500 text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copié' : 'Copier le lien'}
                    </button>
                    <a
                      href={buildShareUrl(justCreated.token)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Active Links Section */}
          {!loading && links.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between ml-1">
                <div className="flex items-center gap-2">
                  <Settings2 size={12} className="text-white/20" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Gérer vos accès publics</h3>
                </div>
                <div className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[10px] font-black text-white/20">
                  {links.length}
                </div>
              </div>

              <div className="space-y-3">
                {links.map((link) => (
                  <LinkRow
                    key={link.id}
                    link={link}
                    onDelete={() => setLinks((prev) => prev.filter((l) => l.id !== link.id))}
                  />
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Calcul des jetons…</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
