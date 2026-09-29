import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageTransition from '../components/PageTransition';
import PageLoader from '../components/PageLoader';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import RoadmapGraph from '../components/Roadmap/RoadmapGraph';
import { RiRefreshLine, RiSparkling2Fill } from 'react-icons/ri';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from 'lucide-react';
import { useTour } from '../context/TourContext';
import { MOCK_TOUR_DATA } from '../utils/mockTourData';

type RoadmapNodeStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REVISION_REQUIRED';

type Skill = {
  id: string;
  title: string;
  description: string;
  status: RoadmapNodeStatus;
  orderIndex: number;
  difficultyLevel?: number;
  targetUserState?: string;
};

type Milestone = {
  id: string;
  title: string;
  description: string;
  status: RoadmapNodeStatus;
  orderIndex: number;
  difficultyLevel?: number;
  targetUserState?: string;
  skills: Skill[];
};

type Roadmap = {
  id: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  dreamId: string;
  dream?: { title: string; deadline?: string };
  milestones: Milestone[];
};

export default function RoadmapPage() {
  const { dreamId } = useParams<{ dreamId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollInterval = useRef<any>(null);



  const fetchRoadmap = useCallback(async () => {
    if (!dreamId) return;
    try {
      // 1. Try to find active roadmap
      const active = await api.get(`/roadmaps/dream/${dreamId}/active`);
      if (active.data?.roadmap) {
        setRoadmap(active.data.roadmap);
        setIsGenerating(false);
        if (pollInterval.current) clearInterval(pollInterval.current);
        return true;
      }

      // 2. Try to find any draft or archived
      const allRes = await api.get(`/roadmaps/dream/${dreamId}/all`);
      const all = allRes.data?.roadmaps || allRes.data || [];
      const latest = Array.isArray(all) ? all[0] : null; // sorted by createdAt desc by backend
      
      if (latest) {
        setRoadmap(latest);
        setIsGenerating(false);
        if (pollInterval.current) clearInterval(pollInterval.current);
        return true;
      }

      return false;
    } catch (e: any) {
      console.error(e);
      return false;
    }
  }, [dreamId]);

  const startGeneration = async () => {
    if (!dreamId) return;
    setIsGenerating(true);
    setError(null);
    try {
      const created = await api.post('/roadmaps/generate', { dreamId });
      setRoadmap(created.data);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const { isTourMode } = useTour();

  const init = useCallback(async () => {
    if (isTourMode) {
      setLoading(true);
      setRoadmap({
        id: 'mock-roadmap-1',
        status: 'ACTIVE',
        dreamId: 'mock-1',
        dream: { title: MOCK_TOUR_DATA.roadmap.dreamTitle, deadline: MOCK_TOUR_DATA.roadmap.eta },
        milestones: MOCK_TOUR_DATA.roadmap.nodes.map((n, i) => ({
          id: `m-${n.id}`,
          title: n.title,
          description: `Master ${n.title} concepts.`,
          status: n.status as any,
          orderIndex: i,
          skills: []
        }))
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    const found = await fetchRoadmap();
    if (!found) {
      await startGeneration();
    }
    setLoading(false);
  }, [fetchRoadmap, isTourMode]);

  useEffect(() => {
    init();
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [init]);

  const activate = async () => {
    if (!roadmap) return;
    setLoading(true);
    try {
      const res = await api.post(`/roadmaps/${roadmap.id}/activate`);
      setRoadmap(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Activation failed');
    } finally {
      setLoading(false);
    }
  };

  const updateMilestoneInline = async (milestoneId: string, data: any) => {
    try {
      await api.patch(`/roadmaps/milestones/${milestoneId}`, data);
      await fetchRoadmap();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Update failed');
    }
  };

  const updateMilestoneStatus = async (milestoneId: string, status: string) => {
    try {
      await api.patch(`/roadmaps/milestones/${milestoneId}/status`, { status });
      await fetchRoadmap();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Update failed');
    }
  };

  const addMilestone = async (data: any) => {
    try {
      await api.post(`/roadmaps/${roadmap?.id}/milestones`, data);
      await fetchRoadmap();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to add milestone');
    }
  };

  const deleteMilestone = async (milestoneId: string) => {
    try {
      await api.delete(`/roadmaps/milestones/${milestoneId}`);
      await fetchRoadmap();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to delete milestone');
    }
  };



  const completeMilestone = async (milestoneId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(`/assessments/milestones/${milestoneId}/complete`);
      const assessmentId = res.data?.id || res.data?.assessmentId; 
      if (assessmentId) {
        navigate(`/app/assessments/${assessmentId}`);
      } else {
        init();
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };


  if (loading && !roadmap) return <PageLoader />;

  return (
    <PageTransition>
      {/* ── Desktop page header — hidden on mobile (mobile view has its own header) ── */}
      <div className="roadmap-page-header" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 80px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: '2.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 12 }}>
              AetherFlow Roadmap
              <div className="group relative" style={{ display: 'inline-flex', cursor: 'help' }}>
                <Info size={18} className="text-white/40 hover:text-cyan-400 transition-colors" />
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-[#0a0f18] border border-white/10 rounded-xl p-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl">
                  <h4 className="text-white font-bold mb-2 text-sm">Difficulty Hierarchy</h4>
                  <ul className="text-white/70 text-xs space-y-1">
                    <li><strong className="text-cyan-400">1</strong> - Foundation</li>
                    <li><strong className="text-cyan-400">2</strong> - Application</li>
                    <li><strong className="text-cyan-400">3</strong> - Integration</li>
                    <li><strong className="text-cyan-400">4</strong> - Advanced Execution</li>
                    <li><strong className="text-cyan-400">5</strong> - Production Mastery</li>
                  </ul>
                </div>
              </div>
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
              Your physical workspace. Pinned, threaded, illuminated.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <GlowButton variant="ghost" onClick={init} disabled={loading || isGenerating}>
                <RiRefreshLine style={{ marginRight: 8 }} /> Refresh
            </GlowButton>
            {roadmap?.status === 'DRAFT' && (
              <GlowButton onClick={activate}>Activate Plan</GlowButton>
            )}
            <GlowButton variant="ghost" onClick={() => navigate('/app/dreams')}>
              Back
            </GlowButton>
          </div>
        </div>

        {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <GlassCard style={{ padding: 16, marginBottom: 24, border: '1px solid rgba(255,80,80,0.3)' }}>
                    <div style={{ color: '#ff6b6b' }}>{error}</div>
                </GlassCard>
            </motion.div>
        )}

        <AnimatePresence mode="wait">
            {isGenerating ? (
                <motion.div
                    key="gen"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                >
                    <GlassCard style={{ padding: '60px 20px', textAlign: 'center' }}>
                        <div style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto 24px' }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                                style={{
                                    position: 'absolute', inset: 0, borderRadius: '50%',
                                    border: '4px solid transparent', borderTopColor: 'var(--color-accent)',
                                    boxShadow: '0 0 20px var(--color-accent)'
                                }}
                            />
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <RiSparkling2Fill size={32} color="var(--color-accent)" />
                            </div>
                        </div>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Architecting Your Roadmap</h3>
                        <p style={{ color: 'var(--color-text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                            Our AI is analyzing your dream to build a custom hierarchy of milestones and skills. This usually takes 10-15 seconds.
                        </p>
                    </GlassCard>
                </motion.div>
            ) : roadmap ? (
                <motion.div key="graph" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <RoadmapGraph
                        milestones={roadmap.milestones}
                        onCompleteMilestone={completeMilestone}
                        onUpdateMilestoneStatus={updateMilestoneStatus}
                        onUpdateMilestone={updateMilestoneInline}
                        onAddMilestone={addMilestone}
                        onDeleteMilestone={deleteMilestone}
                        dreamDeadline={roadmap.dream?.deadline}
                    />
                </motion.div>
            ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <GlassCard style={{ padding: 40, textAlign: 'center' }}>
                        <p style={{ color: 'var(--color-text-secondary)' }}>Failed to initialize roadmap.</p>
                        <GlowButton onClick={startGeneration}>Try Again</GlowButton>
                    </GlassCard>
                </motion.div>
            )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
