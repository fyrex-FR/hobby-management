import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  PackageCheck,
  Save,
  ShoppingBag,
  Tag,
  Truck,
} from 'lucide-react';
import { useCards } from '../../hooks/useCards';
import {
  useEbayAccountStatus,
  useEbayConnect,
  useEbayDisconnect,
  useEbayLocationCreate,
  useEbaySellerSetup,
} from '../../hooks/useEbayAccount';
import { EbayLogo } from '../shared/EbayLogo';
import { cdnImg } from '../../lib/cdn';

function StatTile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: boolean }) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col items-start gap-3">
      <div className={`p-2 rounded-xl ${accent ? 'bg-[var(--accent-glow)]' : 'bg-white/5'}`}>
        <Icon size={18} className={accent ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'} />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">{label}</span>
        <span className="text-2xl font-black tabular-nums tracking-tight mt-0.5" style={{ color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function SetupStep({
  title,
  detail,
  done,
  icon: Icon,
}: {
  title: string;
  detail: string;
  done?: boolean;
  icon: any;
}) {
  return (
    <div className="flex gap-3 rounded-2xl p-3" style={{ background: done ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)' }}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: done ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)' }}
      >
        <Icon size={17} style={{ color: done ? 'var(--green)' : 'var(--accent)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {done ? <CheckCircle2 size={14} style={{ color: 'var(--green)' }} /> : <AlertCircle size={14} style={{ color: 'var(--accent)' }} />}
          <p className="text-sm font-bold text-white">{title}</p>
        </div>
        <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--text-muted)' }}>{detail}</p>
      </div>
    </div>
  );
}

export function EbayView() {
  const { data: cards = [] } = useCards();
  const { data: status, isLoading } = useEbayAccountStatus();
  const { data: setup } = useEbaySellerSetup(Boolean(status?.connected));
  const connect = useEbayConnect();
  const disconnect = useEbayDisconnect();
  const createLocation = useEbayLocationCreate();
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');

  // Retour du flux OAuth (?ebay=connected | ?ebay=error&reason=...), nettoie l'URL ensuite.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ebay = params.get('ebay');
    if (!ebay) return;
    if (ebay === 'connected') {
      setNotice({ kind: 'success', text: 'Compte eBay connecté avec succès.' });
    } else if (ebay === 'error') {
      setNotice({ kind: 'error', text: `Connexion eBay impossible : ${params.get('reason') || 'erreur inconnue'}` });
    }
    params.delete('ebay');
    params.delete('reason');
    const query = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
  }, []);

  const listed = useMemo(() => cards.filter((c) => c.ebay_url), [cards]);
  const readyNotListed = useMemo(
    () => cards.filter((c) => c.status === 'a_vendre' && !c.ebay_url),
    [cards],
  );
  const location = setup?.locations?.[0];
  const policies = setup?.policies;
  const hasLocation = Boolean(location);
  const hasPolicies = Boolean(policies?.configured);

  useEffect(() => {
    const address = location?.location?.address;
    if (!address) return;
    if (address.postalCode) setPostalCode(address.postalCode);
    if (address.city) setCity(address.city);
  }, [location]);

  function saveLocation() {
    createLocation.mutate(
      { postal_code: postalCode.trim(), city: city.trim(), country: 'FR', name: 'CardVaults' },
      {
        onSuccess: () => setNotice({ kind: 'success', text: 'Lieu d’expédition eBay enregistré.' }),
        onError: (e) => setNotice({ kind: 'error', text: (e as Error).message }),
      },
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <EbayLogo width={56} height={22} />
        <div>
          <h1 className="text-xl font-black text-white leading-tight">Centre de contrôle eBay</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Connexion, statut et cartes en vente</p>
        </div>
      </motion.div>

      {notice && (
        <div
          className="rounded-2xl px-4 py-3 text-sm font-medium"
          style={{
            background: notice.kind === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: notice.kind === 'success' ? 'var(--green)' : 'var(--red)',
          }}
        >
          {notice.text}
        </div>
      )}

      <div className="glass rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-black text-white">Avant de publier</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Chaque vendeur configure son propre compte eBay. CardVaults utilise ensuite ces réglages pour créer l’annonce avec la bonne catégorie sport, l’état carte adapté, le lieu d’expédition et les options de vente eBay.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SetupStep
            icon={Link2}
            done={Boolean(status?.connected)}
            title="Compte eBay connecté"
            detail="Connexion OAuth obligatoire : l’annonce est publiée sur le compte du vendeur connecté, pas sur un compte global."
          />
          <SetupStep
            icon={MapPin}
            done={hasLocation}
            title="Lieu d’expédition"
            detail="Code postal et ville à enregistrer dans CardVaults. Cela crée une location eBay active propre au compte vendeur."
          />
          <SetupStep
            icon={CreditCard}
            done={hasPolicies}
            title="Paiement, livraison et retours"
            detail="eBay doit avoir une policy de paiement, une policy de livraison et une policy de retours sur EBAY_FR. CardVaults reprend la première disponible."
          />
          <SetupStep
            icon={Camera}
            done={readyNotListed.length > 0 || listed.length > 0}
            title="Cartes prêtes"
            detail="Avant publication : photo recto, prix positif, titre 80 caractères max et description 5000 caractères max. Titre et description restent modifiables dans la modale."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
            <Truck size={14} style={{ color: 'var(--accent)' }} />
            Expédition depuis le lieu vendeur
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
            <Tag size={14} style={{ color: 'var(--accent)' }} />
            Catégorie sport prioritaire
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
            <FileText size={14} style={{ color: 'var(--accent)' }} />
            Description générée puis éditable
          </div>
        </div>
        {status?.connected && policies && !policies.configured && (
          <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)' }}>
            À configurer côté eBay : {[!policies.payment && 'paiement', !policies.fulfillment && 'livraison', !policies.return && 'retours'].filter(Boolean).join(', ')}.
          </p>
        )}
      </div>

      {/* Statut de connexion */}
      {isLoading ? (
        <div className="glass rounded-2xl p-6">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        </div>
      ) : status?.connected ? (
        <div className="flex flex-col gap-3">
          <div className="glass rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <CheckCircle2 size={22} style={{ color: 'var(--green)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  Connecté{status.ebay_username ? ` en tant que ${status.ebay_username}` : ''}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Marketplace {status.marketplace_id || 'EBAY_FR'}
                  {status.connected_at ? ` · depuis le ${new Date(status.connected_at).toLocaleDateString('fr-FR')}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 shrink-0"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}
            >
              <LogOut size={15} />
              {disconnect.isPending ? 'Déconnexion…' : 'Déconnecter'}
            </button>
          </div>

          <div className="glass rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <MapPin size={18} style={{ color: location ? 'var(--green)' : 'var(--accent)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">Lieu d’expédition</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {location
                    ? `${location.name || location.merchantLocationKey} · ${location.location?.address?.postalCode || ''} ${location.location?.address?.city || ''}`
                    : 'Requis pour publier sur eBay'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2">
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Code postal"
                inputMode="numeric"
                className="rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ville"
                className="rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={saveLocation}
                disabled={createLocation.isPending || !postalCode.trim() || !city.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#09090B' }}
              >
                {createLocation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Connecte ton compte eBay pour publier tes cartes directement depuis
            CardVaults. Chaque utilisateur connecte son propre compte — tes
            annonces sont publiées en ton nom.
          </p>
          {connect.error && (
            <p className="text-xs" style={{ color: 'var(--red)' }}>{(connect.error as Error).message}</p>
          )}
          <button
            onClick={() => connect.mutate()}
            disabled={connect.isPending}
            className="self-start py-3 px-5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#09090B' }}
          >
            {connect.isPending ? 'Redirection…' : 'Connecter mon compte eBay'}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Sur eBay" value={listed.length} icon={ShoppingBag} accent={listed.length > 0} />
        <StatTile label="Prêtes, pas encore listées" value={readyNotListed.length} icon={Tag} accent={readyNotListed.length > 0} />
      </div>

      {/* Cartes déjà sur eBay */}
      {listed.length > 0 && (
        <div className="glass rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 px-1 pb-2">
            <PackageCheck size={14} className="text-[var(--text-muted)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Cartes sur eBay ({listed.length})
            </span>
          </div>
          {listed.map((card) => (
            <a
              key={card.id}
              href={card.ebay_url!}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 py-2 px-1.5 rounded-xl transition-colors hover:bg-white/5"
            >
              {card.image_front_url ? (
                <img src={cdnImg(card.image_front_url)} alt="" className="w-9 h-12 object-cover rounded-lg shrink-0" />
              ) : (
                <div className="w-9 h-12 rounded-lg shrink-0 flex items-center justify-center text-sm" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{card.player ?? '—'}</p>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{[card.team, card.year].filter(Boolean).join(' · ')}</p>
              </div>
              {card.price != null && (
                <span className="text-sm font-black shrink-0" style={{ color: 'var(--accent)' }}>{card.price} €</span>
              )}
              <ExternalLink size={14} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
