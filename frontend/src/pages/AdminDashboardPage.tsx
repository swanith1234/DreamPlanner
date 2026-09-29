import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR, { mutate } from 'swr';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, AreaChart, Area } from 'recharts';
import { Activity, Bug, Trash2, ArrowRight, Users } from 'lucide-react';
import api from '../api/client';
import PageTransition from '../components/PageTransition';

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardData {
  activeToday: number;
  growthChart: { date: string; activeUsers: number }[];
  performanceChart: { id: string; hours: number }[];
  feedbacks: { id: string; type: string; message: string; status: string; createdAt: string; traceId?: string }[];
  totalUsers: number;
  registeredToday: number;
  registeredWeek: number;
  registeredMonth: number;
  registeredYear: number;
  registrationChart: { date: string; rawDate: string; users: number }[];
}

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [timeline, setTimeline] = useState<'week' | 'month' | 'year' | 'all'>('month');

  const { data, error, isLoading } = useSWR<DashboardData>(
    `/admin/dashboard?range=${timeline}`,
    url => api.get(url).then(res => res.data),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000
    }
  );

  const handleAction = async (id: string, action: 'fix' | 'ignore') => {
    try {
      await api.post(`/admin/feedback/${id}/action`, { action });
      mutate(`/admin/dashboard?range=${timeline}`);
    } catch (err) {
      alert('Failed to execute action');
    }
  };

  if (isLoading && !data) return <div style={{ padding: 40, color: '#fff' }}>Loading Admin Portal...</div>;
  if (error) return <div style={{ padding: 40, color: 'red' }}>Error: {error.message || 'Failed to load dashboard'}</div>;
  if (!data) return null;

  return (
    <PageTransition>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        
        {/* HEADER */}
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Admin Command Center
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: 4 }}>
            Monitor ecosystem health and manage autonomous agents.
          </p>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {/* Active Today */}
          <div style={{
            background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Active Today</p>
              <h2 style={{ color: 'var(--color-accent)', fontSize: '2.5rem', fontWeight: 800, margin: '8px 0 0 0' }}>{data.activeToday}</h2>
            </div>
            <div style={{ padding: 16, background: 'rgba(0, 242, 234, 0.1)', borderRadius: '50%', color: 'var(--color-accent)' }}>
              <Activity size={32} />
            </div>
          </div>

          {/* Registrations Total */}
          <div style={{
            background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Total Users</p>
              <h2 style={{ color: '#E2B8FF', fontSize: '2.5rem', fontWeight: 800, margin: '8px 0 0 0' }}>{data.totalUsers}</h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4}}><strong style={{color: '#fff'}}>+{data.registeredToday}</strong> Today</span>
                <span style={{background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4}}><strong style={{color: '#fff'}}>+{data.registeredWeek}</strong> Week</span>
                <span style={{background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4}}><strong style={{color: '#fff'}}>+{data.registeredMonth}</strong> Month</span>
                <span style={{background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4}}><strong style={{color: '#fff'}}>+{data.registeredYear}</strong> Year</span>
              </div>
            </div>
            <div style={{ padding: 16, background: 'rgba(226, 184, 255, 0.1)', borderRadius: '50%', color: '#E2B8FF' }}>
              <Users size={32} />
            </div>
          </div>

          {/* Pending Bugs */}
          <div style={{
            background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Pending Bugs</p>
              <h2 style={{ color: '#FF4C4C', fontSize: '2.5rem', fontWeight: 800, margin: '8px 0 0 0' }}>
                {data.feedbacks.filter(f => f.status === 'PENDING' && f.type === 'BUG').length}
              </h2>
            </div>
            <div style={{ padding: 16, background: 'rgba(255, 76, 76, 0.1)', borderRadius: '50%', color: '#FF4C4C' }}>
              <Bug size={32} />
            </div>
          </div>
        </div>

        {/* CHARTS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
          
          {/* Registration Chart (Full Width) */}
          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
              <h3 style={{ fontSize: '1.1rem' }}>User Registrations Over Time</h3>
              <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 8 }}>
                {(['week', 'month', 'year', 'all'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTimeline(t)}
                    style={{
                      padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: timeline === t ? 'var(--color-accent)' : 'transparent',
                      color: timeline === t ? '#000' : 'var(--color-text-secondary)',
                      fontWeight: timeline === t ? 700 : 500,
                      textTransform: 'capitalize', transition: 'all 0.2s'
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <AreaChart data={data.registrationChart}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ background: '#1A1D2D', border: 'none', borderRadius: 8, color: '#fff' }} />
                  <Area type="monotone" dataKey="users" stroke="var(--color-accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Growth Chart */}
          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 20 }}>30-Day Growth (Active Users)</h3>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <LineChart data={data.growthChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ background: '#1A1D2D', border: 'none', borderRadius: 8, color: '#fff' }} />
                  <Line type="monotone" dataKey="activeUsers" stroke="#E2B8FF" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Chart */}
          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 20 }}>Agent Performance (Resolution Hrs)</h3>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <BarChart data={data.performanceChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="id" stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.5)" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip contentStyle={{ background: '#1A1D2D', border: 'none', borderRadius: 8, color: '#fff' }} />
                  <Bar dataKey="hours" fill="#00a29f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* FEEDBACK TABLE */}
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 20, padding: 24 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: 20 }}>Telemetry & Feedback Logs</h3>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>ID / Trace</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Message</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.feedbacks.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px', color: 'var(--color-accent)' }}>
                      <div style={{ fontFamily: 'monospace' }}>{f.id.slice(0, 8)}</div>
                      {f.traceId && <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Trace: {f.traceId.slice(0, 8)}</div>}
                    </td>
                    <td style={{ padding: '16px', maxWidth: 300 }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.message}</div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{
                        padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700,
                        background: f.status === 'PENDING' ? 'rgba(255, 193, 7, 0.15)' :
                                    f.status === 'IN_PROGRESS' ? 'rgba(0, 242, 234, 0.15)' :
                                    f.status === 'RESOLVED' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 76, 76, 0.15)',
                        color: f.status === 'PENDING' ? '#FFC107' :
                                f.status === 'IN_PROGRESS' ? 'var(--color-accent)' :
                                f.status === 'RESOLVED' ? '#4CAF50' : '#FF4C4C'
                      }}>
                        {f.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {f.status === 'PENDING' && f.type === 'BUG' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => handleAction(f.id, 'fix')} style={{
                            background: 'rgba(0, 242, 234, 0.1)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)',
                            padding: '6px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: 600
                          }}>
                            <ArrowRight size={14} /> Dispatch Agent
                          </button>
                          <button onClick={() => handleAction(f.id, 'ignore')} style={{
                            background: 'rgba(255, 76, 76, 0.1)', color: '#FF4C4C', border: '1px solid #FF4C4C',
                            padding: '6px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: 600
                          }}>
                            <Trash2 size={14} /> Ignore
                          </button>
                        </div>
                      )}
                      {f.status === 'IN_PROGRESS' && (
                        <button onClick={() => navigate(`/app/fix/${f.id}`)} style={{
                          background: 'rgba(0, 242, 234, 0.1)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)',
                          padding: '6px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          fontSize: '0.8rem', fontWeight: 600
                        }}>
                          <Activity size={14} /> View Progress
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </PageTransition>
  );
};

export default AdminDashboardPage;
