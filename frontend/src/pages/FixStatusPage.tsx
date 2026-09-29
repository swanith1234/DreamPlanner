import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import useSWR from 'swr';
import { Terminal, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, Loader2, Activity } from 'lucide-react';
import api from '../api/client';
import PageTransition from '../components/PageTransition';
import GlassCard from '../components/GlassCard';

interface PipelineLog {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}

const FixStatusPage: React.FC = () => {
  const { feedbackId } = useParams<{ feedbackId: string }>();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  const { data, error, isLoading } = useSWR<{ logs: PipelineLog[] }>(
    feedbackId ? `/admin/feedback/${feedbackId}/logs` : null,
    url => api.get(url).then(res => res.data),
    {
      refreshInterval: autoRefresh ? 3000 : 0,
      revalidateOnFocus: true,
      dedupingInterval: 1000
    }
  );

  const logs = data?.logs || [];

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return '#ff4c4c';
      case 'WARN': return '#ffc107';
      case 'SUCCESS': return '#4caf50';
      default: return 'var(--color-accent)';
    }
  };

  return (
    <PageTransition>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link to="/app/admin" style={{ color: 'var(--color-text-secondary)' }}>
              <ArrowLeft size={24} />
            </Link>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Terminal size={24} className="text-cyan-400" />
                Live Agent Fix Pipeline
              </h1>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                Tracking autonomous agent activity for Task: <span style={{ color: 'var(--color-accent)', fontFamily: 'monospace' }}>{feedbackId}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--glass-border)',
              background: autoRefresh ? 'rgba(0, 242, 234, 0.1)' : 'transparent',
              color: autoRefresh ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem'
            }}
          >
            {autoRefresh ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {autoRefresh ? 'Live Updates ON' : 'Live Updates OFF'}
          </button>
        </div>

        {/* Console View */}
        <GlassCard className="p-0 border-none shadow-2xl overflow-hidden" style={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Console Header */}
          <div style={{ background: '#161b22', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginLeft: 12, fontFamily: 'monospace' }}>agent-sentinel-v1.0.4 --bash</span>
          </div>

          {/* Console Body */}
          <div style={{ height: '600px', overflowY: 'auto', padding: '20px', fontFamily: '"Fira Code", monospace', fontSize: '0.9rem', lineBreak: 'anywhere' }}>
            {isLoading && logs.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--color-text-secondary)' }}>
                <Loader2 size={18} className="animate-spin" />
                Initializing pipeline connection...
              </div>
            ) : error ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#ff4c4c' }}>
                <AlertCircle size={18} />
                {error.message || 'Failed to load pipeline logs'}
              </div>
            ) : logs.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                No activity logs found for this pipeline yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {logs.map((log) => (
                  <div key={log.id} style={{ display: 'flex', gap: 16 }}>
                    <span style={{ color: 'rgba(255,255,255,0.2)', minWidth: '80px', fontSize: '0.75rem', paddingTop: '3px' }}>
                      {new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span style={{ color: getLevelColor(log.level), fontWeight: 700, minWidth: '60px', fontSize: '0.75rem', paddingTop: '3px' }}>
                      [{log.level}]
                    </span>
                    <div style={{ color: 'rgba(255,255,255,0.85)', flex: 1 }}>
                      {log.message.split('\n').map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </GlassCard>

        {/* Footer info */}
        <div style={{ display: 'flex', gap: 24, padding: '0 8px' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
             <CheckCircle2 size={14} className="text-green-500" />
             Endpoint Connected
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
             <Activity size={14} className="text-cyan-500" />
             Agent Status: Active
           </div>
        </div>

      </div>
    </PageTransition>
  );
};

export default FixStatusPage;
