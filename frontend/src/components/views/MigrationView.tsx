import { useState, useEffect, useRef } from 'react';
import { Database, Play, RefreshCw, CheckCircle, AlertCircle, Eye, FileSearch, Link2 } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { Badge, Notice, Page, PageHeader, Panel } from '../ui';

interface MigrationStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  total: number;
  migrated: number;
  errors: { path: string; error: string }[];
  started_at: number | null;
  finished_at: number | null;
}

interface PreviewResult {
  total_files: number;
  sample: string[];
}

interface UpdateUrlsResult {
  executed: boolean;
  sql?: string;
  message: string;
}

interface VerifyResult {
  status: 'idle' | 'running' | 'done' | 'error';
  checked: number;
  total: number;
  missing: number;
  all_good: boolean;
  missing_files: { card_id: string; field: string; path: string }[];
}

export default function MigrationView() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [urlResult, setUrlResult] = useState<UpdateUrlsResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await apiFetch<MigrationStatus>('/admin/migration/status');
      setStatus(data);
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (status?.status === 'running') {
      intervalRef.current = setInterval(fetchStatus, 2000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status?.status]);

  const handlePreview = async () => {
    setLoading('preview');
    setError('');
    try {
      const data = await apiFetch<PreviewResult>('/admin/migration/preview');
      setPreview(data);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading('');
  };

  const handleStart = async () => {
    setLoading('start');
    setError('');
    try {
      await apiFetch('/admin/migration/start', { method: 'POST' });
      await fetchStatus();
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading('');
  };

  const handleUpdateUrls = async () => {
    setLoading('urls');
    setError('');
    try {
      const data = await apiFetch<UpdateUrlsResult>('/admin/migration/update-urls', { method: 'POST' });
      setUrlResult(data);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading('');
  };

  const handleVerify = async () => {
    setLoading('verify');
    setError('');
    setVerifyResult(null);
    try {
      await apiFetch('/admin/migration/verify', { method: 'POST' });
      // Poll until done
      const poll = setInterval(async () => {
        try {
          const data = await apiFetch<VerifyResult>('/admin/migration/verify');
          setVerifyResult(data);
          if (data.status === 'done' || data.status === 'error') {
            clearInterval(poll);
            setLoading('');
          }
        } catch (e) {
          clearInterval(poll);
          setError((e as Error).message);
          setLoading('');
        }
      }, 2000);
    } catch (e) {
      setError((e as Error).message);
      setLoading('');
    }
  };

  const progress = status?.total ? Math.round((status.migrated / status.total) * 100) : 0;

  return (
    <Page width="narrow">
      <PageHeader title="Migration Supabase → R2" subtitle="Copie des images vers R2, vérification puis bascule des URLs." />

      {/* Statut */}
      <Panel title="Statut" icon={Database} action={<StatusBadge status={status?.status ?? 'idle'} />}>
        {status?.status === 'running' ? (
          <div className="space-y-2">
            <div className="flex justify-between text-[13px] text-[var(--text-muted)]">
              <span className="tabular">{status.migrated} / {status.total} fichiers</span>
              <span className="tabular">{progress}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>
        ) : status?.status === 'done' ? (
          <div className="space-y-1 text-[13px] text-[var(--text-secondary)]">
            <p><span className="tabular">{status.migrated}</span> fichiers migrés avec succès</p>
            {status.errors.length > 0 && (
              <p className="text-[var(--red)]"><span className="tabular">{status.errors.length}</span> erreur(s)</p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-muted)]">Aucune migration en cours.</p>
        )}
      </Panel>

      {/* Actions */}
      <Panel title="Actions">
        <div className="flex flex-wrap gap-2">
          <button onClick={handlePreview} disabled={loading === 'preview'} className="ui-btn">
            <Eye size={15} />
            {loading === 'preview' ? 'Chargement...' : 'Preview'}
          </button>

          <button
            onClick={handleStart}
            disabled={loading === 'start' || status?.status === 'running'}
            className="ui-btn ui-btn-primary"
          >
            <Play size={15} />
            {status?.status === 'running' ? 'En cours...' : 'Lancer la migration'}
          </button>

          <button onClick={handleVerify} disabled={loading === 'verify'} className="ui-btn">
            <CheckCircle size={15} />
            {loading === 'verify' ? 'Vérification...' : 'Vérifier R2'}
          </button>

          <button
            onClick={handleUpdateUrls}
            disabled={loading === 'urls' || !verifyResult?.all_good}
            className="ui-btn"
            title={!verifyResult?.all_good ? 'Lance d’abord une vérification R2 complète' : undefined}
          >
            <RefreshCw size={15} />
            {loading === 'urls' ? 'Mise à jour...' : 'Mettre à jour les URLs'}
          </button>
        </div>
      </Panel>

      {/* Generic Error */}
      {error && <Notice tone="error" icon={AlertCircle}>{error}</Notice>}

      {/* Preview Result */}
      {preview && (
        <Panel title={`Preview : ${preview.total_files} fichiers à migrer`} icon={FileSearch}>
          <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--text-muted)]">
            {preview.sample.map((f) => (
              <div key={f} className="break-all font-mono">{f}</div>
            ))}
            {preview.total_files > 20 && <div>... et {preview.total_files - 20} autres</div>}
          </div>
        </Panel>
      )}

      {/* Verify Result */}
      {verifyResult && (
        <Panel title="Vérification R2" icon={CheckCircle}>
          <div className="space-y-3">
            {verifyResult.status === 'running' && (
              <div className="space-y-2">
                <p className="tabular text-[13px] text-[var(--accent)]">
                  Vérification en cours... {verifyResult.checked}/{verifyResult.total}
                </p>
                {verifyResult.total > 0 && <ProgressBar value={Math.round((verifyResult.checked / verifyResult.total) * 100)} />}
              </div>
            )}
            {verifyResult.status === 'done' && (
              <Notice tone={verifyResult.all_good ? 'success' : 'error'}>
                {verifyResult.all_good
                  ? `Tout est bon — ${verifyResult.checked} fichiers vérifiés dans R2`
                  : `${verifyResult.missing} fichier(s) manquant(s) sur ${verifyResult.checked} vérifiés`}
              </Notice>
            )}
            {verifyResult.status === 'error' && <Notice tone="error">Erreur lors de la vérification</Notice>}
            {verifyResult.missing_files.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--text-muted)]">
                {verifyResult.missing_files.map((f, i) => (
                  <div key={i} className="break-all font-mono">{f.field}: {f.path}</div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* URL Update Result */}
      {urlResult && (
        <Panel title={urlResult.executed ? 'URLs mises à jour' : 'SQL à exécuter manuellement'} icon={Link2}>
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--text-primary)]">{urlResult.message}</p>
            {urlResult.sql && (
              <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-xs text-[var(--text-secondary)]">
                {urlResult.sql}
              </pre>
            )}
          </div>
        </Panel>
      )}

      {/* Errors */}
      {status?.errors && status.errors.length > 0 && (
        <Panel title={<span className="flex items-center gap-2">Erreurs <Badge tone="red"><span className="tabular">{status.errors.length}</span></Badge></span>} icon={AlertCircle}>
          <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--text-muted)]">
            {status.errors.map((e, i) => (
              <div key={i} className="break-all font-mono">{e.path}: {e.error}</div>
            ))}
          </div>
        </Panel>
      )}
    </Page>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
      <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${value}%` }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle; label: string; tone: 'neutral' | 'accent' | 'green' | 'red' }> = {
    idle: { icon: Database, label: 'En attente', tone: 'neutral' },
    running: { icon: RefreshCw, label: 'En cours', tone: 'accent' },
    done: { icon: CheckCircle, label: 'Terminé', tone: 'green' },
    error: { icon: AlertCircle, label: 'Erreur', tone: 'red' },
  };
  const { icon: Icon, label, tone } = config[status] ?? config.idle;

  return (
    <Badge tone={tone}>
      <Icon size={12} className={status === 'running' ? 'animate-spin' : ''} />
      {label}
    </Badge>
  );
}
