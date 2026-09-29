import { useState, useEffect } from 'react';
import {
  Share2,
  Link2,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
  Globe,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '../../api/client';
import { Badge, Field, Modal, Spinner } from '../ui';

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
    } catch {
      setDeleting(false);
    }
  }

  const filterLabel = FILTER_OPTIONS.find((o) => o.value === link.filter)?.label ?? link.filter;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-elevated)] text-[var(--text-muted)]">
        <Globe size={16} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{link.title || filterLabel}</p>
          {link.show_prices ? <Badge tone="green">Prix visibles</Badge> : <Badge>Prix masqués</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
          {filterLabel} · <span className="font-mono">{link.token}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={handleCopy}
          className="ui-btn ui-btn-sm ui-btn-icon"
          data-active={copied}
          title={copied ? 'Copié' : 'Copier le lien'}
          aria-label="Copier le lien"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="ui-btn ui-btn-sm ui-btn-icon ui-btn-danger"
          title="Supprimer le lien"
          aria-label="Supprimer le lien"
        >
          {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      </div>
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
    try {
      const created = await apiFetch<ShareLink>('/share', {
        method: 'POST',
        body: JSON.stringify({ filter: newFilter, show_prices: newShowPrices, title: newTitle || null }),
      });
      setLinks((prev) => [created, ...prev]);
      setJustCreated(created);
      setNewTitle('');
      setCreating(false);
    } catch {
      setCreating(false);
    }
  }

  async function handleCopyNew() {
    if (!justCreated) return;
    await navigator.clipboard.writeText(buildShareUrl(justCreated.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal
      onClose={onClose}
      size="md"
      title="Partager ma collection"
      subtitle="Crée un lien public : tes visiteurs parcourent tes cartes et t'envoient leurs demandes."
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-dim)] text-[var(--accent)]">
          <Share2 size={17} />
        </span>
      }
    >
      <div className="space-y-6">
        {/* Création */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Nouveau lien</h3>

          <Field label="Titre de la galerie" hint="Optionnel, affiché en haut de la page publique.">
            <input
              className="ui-input"
              placeholder="ex : Mes hits 2024-25"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </Field>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">Contenu partagé</span>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Contenu partagé">
              {FILTER_OPTIONS.map((opt) => {
                const active = newFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setNewFilter(opt.value)}
                    className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-[var(--border-accent)] bg-[var(--accent-dim)]'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className={`text-[13px] font-medium ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{opt.label}</span>
                    <span className="text-xs text-[var(--text-muted)]">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            role="switch"
            aria-checked={newShowPrices}
            onClick={() => setNewShowPrices(!newShowPrices)}
            className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
          >
            <span className={newShowPrices ? 'text-[var(--green)]' : 'text-[var(--text-muted)]'}>
              {newShowPrices ? <Eye size={16} /> : <EyeOff size={16} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[var(--text-primary)]">Afficher les prix</span>
              <span className="block text-xs text-[var(--text-muted)]">{newShowPrices ? 'Les prix sont visibles par les visiteurs' : 'Les prix restent masqués'}</span>
            </span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${newShowPrices ? 'bg-[var(--green)]' : 'bg-[var(--bg-hover)]'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${newShowPrices ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
          </button>

          <button onClick={handleCreate} disabled={creating} className="ui-btn ui-btn-primary ui-btn-lg w-full">
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
            {creating ? 'Création du lien…' : 'Créer le lien public'}
          </button>

          {justCreated && (
            <div
              className="space-y-3 rounded-xl p-3"
              style={{ background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 22%, transparent)' }}
            >
              <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--green)]">
                <Check size={15} /> Lien prêt à partager
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={buildShareUrl(justCreated.token)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="ui-input min-w-0 flex-1 font-mono text-xs"
                  aria-label="Lien de partage"
                />
                <button onClick={handleCopyNew} className="ui-btn ui-btn-success shrink-0">
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
                <a
                  href={buildShareUrl(justCreated.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn-icon shrink-0"
                  title="Ouvrir la page publique"
                  aria-label="Ouvrir la page publique"
                >
                  <ExternalLink size={15} />
                </a>
              </div>
            </div>
          )}
        </section>

        {/* Liens existants */}
        {loading && <Spinner label="Chargement des liens…" />}

        {!loading && links.length > 0 && (
          <section className="space-y-3 border-t border-[var(--border)] pt-5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Liens actifs</h3>
              <Badge><span className="tabular">{links.length}</span></Badge>
            </div>
            <div className="space-y-2">
              {links.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  onDelete={() => setLinks((prev) => prev.filter((l) => l.id !== link.id))}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
