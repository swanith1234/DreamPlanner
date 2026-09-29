import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import PageTransition from '../components/PageTransition';
import PageLoader from '../components/PageLoader';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, SkipForward } from 'lucide-react';

type Question = {
  id: string;
  prompt: string;
  options: [string, string, string, string];
};

export default function AssessmentPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [result, setResult] = useState<any>(null);

  const questions: Question[] = useMemo(() => {
    const qs = assessment?.questionSet?.questions;
    return Array.isArray(qs) ? qs : [];
  }, [assessment]);

  const fetchAssessment = async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/assessments/${assessmentId}`);
      setAssessment(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  const submit = async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post(`/assessments/${assessmentId}/attempt`, { answers });
      setResult(res.data);
      if (res.data.status === 'PASSED') {
        const checkRes = await api.get(`/assessments/${assessmentId}`);
        setAssessment(checkRes.data);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to submit attempt');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setAnswers({});
  };

  const handleSkipToNext = async () => {
    if (!assessment) return;
    try {
      setLoading(true);
      await api.patch(`/roadmaps/milestones/${assessment.entityId}/status`, { status: 'REVISION_REQUIRED' });
      navigate(-1);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to update status');
      setLoading(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <PageTransition>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2>Assessment</h2>
          <GlowButton variant="ghost" onClick={() => navigate(-1)}>Back</GlowButton>
        </div>

        {error && (
          <GlassCard style={{ padding: 16, marginBottom: 16, border: '1px solid rgba(255,80,80,0.35)' }}>
            <div style={{ color: '#ff6b6b' }}>{error}</div>
          </GlassCard>
        )}



        <AnimatePresence>
          {result && result.status === 'PASSED' && (
            <motion.div className="success-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="success-modal" style={{ background: '#1a1f2e', padding: 32, borderRadius: 16, maxWidth: 400, width: '100%', border: '1px solid rgba(16,185,129,0.3)', boxShadow: '0 20px 40px rgba(16,185,129,0.1)' }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>✓</div>
                  <h3 style={{ margin: 0, color: '#10b981', fontSize: '1.5rem' }}>Assessment Passed</h3>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, marginBottom: 24, fontSize: '1rem' }}>
                  Excellent work! You scored <strong style={{ color: '#10b981' }}>{result.score}%</strong>. You've officially mastered this concept and unlocked the next phase of the roadmap.
                </p>
                <GlowButton onClick={() => navigate(-1)} style={{ width: '100%', justifyContent: 'center' }}>
                  Return to Roadmap
                </GlowButton>
              </motion.div>
            </motion.div>
          )}

          {result && result.status === 'FAILED' && (
            <motion.div className="failure-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="failure-modal" style={{ background: '#1a1f2e', padding: 32, borderRadius: 16, maxWidth: 400, width: '100%', border: '1px solid rgba(255,80,80,0.2)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
                <h3 style={{ marginTop: 0, color: '#ff6b6b' }}>Not quite there yet...</h3>
                <p style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 24 }}>You scored <strong>{result.score}%</strong>. You can try again right now, or keep this node in revision if you want to move forward and come back to it later.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button onClick={handleRetry} style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}>
                    <RotateCcw size={16} /> Continue tightly with this node (Retry)
                  </button>
                  <button onClick={handleSkipToNext} style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: '#ff6b6b', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SkipForward size={16} /> Continue to next node</div>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>(Keep current node in Revision)</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <GlassCard style={{ padding: 18, filter: result?.status === 'FAILED' ? 'blur(4px)' : 'none' }}>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            {assessment?.questionSet?.instructions || 'Answer the questions below.'}
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {questions.map((q, idx) => (
              <div key={q.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)', paddingTop: idx === 0 ? 0 : 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{idx + 1}. {q.prompt}</div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {Array.isArray(q.options) && q.options.map((opt, optIdx) => (
                    <label key={optIdx} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === optIdx}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: optIdx }))}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <GlowButton onClick={submit} disabled={!questions.length}>Submit</GlowButton>
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  );
}

