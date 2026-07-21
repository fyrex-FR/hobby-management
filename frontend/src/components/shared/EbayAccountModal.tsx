import { X, CheckCircle2, LogOut } from 'lucide-react';
import { EbayLogo } from './EbayLogo';
import { useEbayAccountStatus, useEbayConnect, useEbayDisconnect } from '../../hooks/useEbayAccount';

interface Props {
  onClose: () => void;
  /** Message affiché en haut (retour du callback OAuth : succès ou erreur). */
  initialNotice?: { kind: 'success' | 'error'; text: string } | null;
}

export function EbayAccountModal({ onClose, initialNotice }: Props) {
  const { data: status, isLoading } = useEbayAccountStatus();
  const connect = useEbayConnect();
  const disconnect = useEbayDisconnect();

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl glass border-strong shadow-2xl p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EbayLogo width={48} height={19} />
            <span className="text-sm font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Compte vendeur
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {initialNotice && (
          <div
            className="rounded-xl px-3 py-2 text-xs font-medium"
            style={{
              background: initialNotice.kind === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: initialNotice.kind === 'success' ? 'var(--green)' : 'var(--red)',
            }}
          >
            {initialNotice.text}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement…</p>
        ) : status?.connected ? (
          <>
            <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: 'rgba(34,197,94,0.08)' }}>
              <CheckCircle2 size={22} style={{ color: 'var(--green)' }} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  Connecté{status.ebay_username ? ` en tant que ${status.ebay_username}` : ''}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Marketplace {status.marketplace_id || 'EBAY_FR'}
                </p>
              </div>
            </div>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}
            >
              <LogOut size={15} />
              {disconnect.isPending ? 'Déconnexion…' : 'Déconnecter mon compte eBay'}
            </button>
          </>
        ) : (
          <>
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
              className="py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#09090B' }}
            >
              {connect.isPending ? 'Redirection…' : 'Connecter mon compte eBay'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
