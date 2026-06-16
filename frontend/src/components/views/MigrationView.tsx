import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Database, Play, RefreshCw, CheckCircle, AlertCircle, Eye } from 'lucide-react';
import { apiFetch } from '../../api/client';

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
  checked: number;
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
    } catch (e: any) {
      setError(e.message);
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
    } catch (e: any) {
      setError(e.message);
    }
    setLoading('');
  };

  const handleStart = async () => {
    setLoading('start');
    setError('');
    try {
      await apiFetch('/admin/migration/start', { method: 'POST' });
      await fetchStatus();
    } catch (e: any) {
      setError(e.message);
    }
    setLoading('');
  };

  const handleUpdateUrls = async () => {
    setLoading('urls');
    setError('');
    try {
      const data = await apiFetch<UpdateUrlsResult>('/admin/migration/update-urls', { method: 'POST' });
      setUrlResult(data);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading('');
  };

  const handleVerify = async () => {
    setLoading('verify');
    setError('');
    try {
      const data = await apiFetch<VerifyResult>('/admin/migration/verify');
      setVerifyResult(data);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading('');
  };

  const progress = status?.total ? Math.round((status.migrated / status.total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 max-w-2xl mx-auto space-y-6"
    >
      <div className="flex items-center gap-3">
        <Database size={24} style={{ color: 'var(--accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Migration Supabase → R2
        </h1>
      </div>

      {/* Status Card */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Statut</span>
          <StatusBadge status={status?.status ?? 'idle'} />
        </div>

        {status?.status === 'running' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm" style={{ color: 'var(--text-muted)' }}>
              <span>{status.migrated} / {status.total} fichiers</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'var(--accent)' }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {status?.status === 'done' && (
          <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
            <p>{status.migrated} fichiers migrés avec succès</p>
            {status.errors.length > 0 && (
              <p style={{ color: 'var(--color-error, #ef4444)' }}>{status.errors.length} erreur(s)</p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Actions</h2>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handlePreview}
            disabled={loading === 'preview'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            <Eye size={16} />
            {loading === 'preview' ? 'Chargement...' : 'Preview'}
          </button>

          <button
            onClick={handleStart}
            disabled={loading === 'start' || status?.status === 'running'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Play size={16} />
            {status?.status === 'running' ? 'En cours...' : 'Lancer la migration'}
          </button>

          <button
            onClick={handleVerify}
            disabled={loading === 'verify'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            <CheckCircle size={16} />
            {loading === 'verify' ? 'Vérification...' : 'Vérifier R2'}
          </button>

          <button
            onClick={handleUpdateUrls}
            disabled={loading === 'urls' || !verifyResult?.all_good}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            <RefreshCw size={16} />
            {loading === 'urls' ? 'Mise à jour...' : 'Mettre à jour les URLs'}
          </button>
        </div>
      </div>

      {/* Preview Result */}
      {preview && (
        <div className="rounded-2xl p-5 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Preview : {preview.total_files} fichiers à migrer
          </h2>
          <div className="text-xs space-y-1 max-h-40 overflow-y-auto" style={{ color: 'var(--text-muted)' }}>
            {preview.sample.map((f) => (
              <div key={f} className="font-mono">{f}</div>
            ))}
            {preview.total_files > 20 && <div>... et {preview.total_files - 20} autres</div>}
          </div>
        </div>
      )}

      {/* Verify Result */}
      {verifyResult && (
        <div
          className="rounded-2xl p-5 space-y-2"
          style={{
            background: 'var(--bg-card)',
            border: `1px solid ${verifyResult.all_good ? '#22c55e' : 'rgba(239,68,68,0.5)'}`,
          }}
        >
          <h2 className="text-sm font-medium" style={{ color: verifyResult.all_good ? '#22c55e' : '#ef4444' }}>
            {verifyResult.all_good
              ? `Tout est bon — ${verifyResult.checked} fichiers vérifiés dans R2`
              : `${verifyResult.missing} fichier(s) manquant(s) sur ${verifyResult.checked} vérifiés`}
          </h2>
          {verifyResult.missing_files.length > 0 && (
            <div className="text-xs space-y-1 max-h-40 overflow-y-auto" style={{ color: 'var(--text-muted)' }}>
              {verifyResult.missing_files.map((f, i) => (
                <div key={i} className="font-mono">{f.field}: {f.path}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* URL Update Result */}
      {urlResult && (
        <div className="rounded-2xl p-5 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {urlResult.executed ? 'URLs mises à jour' : 'SQL à exécuter manuellement'}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{urlResult.message}</p>
          {urlResult.sql && (
            <pre className="text-xs p-3 rounded-xl overflow-x-auto" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              {urlResult.sql}
            </pre>
          )}
        </div>
      )}

      {/* Errors */}
      {status?.errors && status.errors.length > 0 && (
        <div className="rounded-2xl p-5 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <h2 className="text-sm font-medium" style={{ color: '#ef4444' }}>
            Erreurs ({status.errors.length})
          </h2>
          <div className="text-xs space-y-1 max-h-40 overflow-y-auto" style={{ color: 'var(--text-muted)' }}>
            {status.errors.map((e, i) => (
              <div key={i} className="font-mono">{e.path}: {e.error}</div>
            ))}
          </div>
        </div>
      )}

      {/* Generic Error */}
      {error && (
        <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle; label: string; color: string }> = {
    idle: { icon: Database, label: 'En attente', color: 'var(--text-muted)' },
    running: { icon: RefreshCw, label: 'En cours', color: 'var(--accent)' },
    done: { icon: CheckCircle, label: 'Terminé', color: '#22c55e' },
    error: { icon: AlertCircle, label: 'Erreur', color: '#ef4444' },
  };
  const { icon: Icon, label, color } = config[status] ?? config.idle;

  return (
    <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
      <Icon size={14} className={status === 'running' ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}
