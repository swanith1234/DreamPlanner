import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RiAddLine, RiTimeLine, RiFireLine, RiEditLine, RiDeleteBinLine, RiRoadMapLine } from 'react-icons/ri';
import useSWR, { mutate } from 'swr';
import api from '../api/client';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import PageTransition from '../components/PageTransition';
import PageLoader from '../components/PageLoader';
import { useTour } from '../context/TourContext';
import { MOCK_TOUR_DATA } from '../utils/mockTourData';

interface Dream {
    id: string;
    title: string;
    description: string;
    domain?: string;
    targetGoal?: string;
    currentSkillLevel?: string;
    motivationStatement: string;
    deadline: string;
    impactScore: number;
    additionalContext?: string;
}

const DreamsPage: React.FC = () => {
    const navigate = useNavigate();
    const [showCreate, setShowCreate] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [selectedDream, setSelectedDream] = useState<Dream | null>(null);

    // Form State
    const [title, setTitle] = useState('');
    const [domain, setDomain] = useState('');
    const [targetGoal, setTargetGoal] = useState('');
    const [currentSkillLevel, setCurrentSkillLevel] = useState('');
    const [description, setDescription] = useState('');
    const [motivation, setMotivation] = useState('');
    const [deadline, setDeadline] = useState('');
    const [impactScore, setImpactScore] = useState(8);
    const [additionalContext, setAdditionalContext] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { isTourMode } = useTour();

    // SWR for deduplicated and cached fetching
    const { data: dreamsRes, isLoading } = useSWR(
        !isTourMode ? '/dreams' : null,
        url => api.get(url).then(res => res.data),
        {
            revalidateOnFocus: false,
            dedupingInterval: 5000 // 5s deduping
        }
    );

    const dreams: Dream[] = isTourMode ? [{
        id: 'mock-1',
        title: MOCK_TOUR_DATA.roadmap.dreamTitle,
        description: 'Master cloud architecture and build scalable serverless systems seamlessly.',
        motivationStatement: 'David Goggins. They don\'t know me son.',
        deadline: '2026-12-01T00:00:00Z',
        impactScore: 10
    }] : (dreamsRes?.dreams || []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const res = await api.post('/dreams', {
                title,
                domain,
                targetGoal,
                currentSkillLevel,
                description,
                motivationStatement: motivation,
                deadline: new Date(deadline).toISOString(),
                impactScore: impactScore,
                additionalContext
            });
            setShowCreate(false);
            resetForm();
            mutate('/dreams'); // Revalidate SWR cache
            const createdDreamId = res.data?.id;
            if (createdDreamId) {
                navigate(`/app/dreams/${createdDreamId}/roadmap`);
            }
        } catch (error) {
            console.error("Failed to create dream", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setTitle('');
        setDomain('');
        setTargetGoal('');
        setCurrentSkillLevel('');
        setDescription('');
        setMotivation('');
        setDeadline('');
        setImpactScore(8);
        setAdditionalContext('');
        setSelectedDream(null);
    };

    const openEdit = (dream: Dream) => {
        setSelectedDream(dream);
        setTitle(dream.title);
        setDomain(dream.domain || '');
        setTargetGoal(dream.targetGoal || '');
        setCurrentSkillLevel(dream.currentSkillLevel || '');
        setDescription(dream.description);
        setMotivation(dream.motivationStatement);
        setDeadline(dream.deadline ? new Date(dream.deadline).toISOString().split('T')[0] : '');
        setImpactScore(dream.impactScore);
        setAdditionalContext(dream.additionalContext || '');
        setShowEdit(true);
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDream) return;
        setIsSubmitting(true);
        try {
            await api.put(`/dreams/${selectedDream.id}`, {
                title,
                domain,
                targetGoal,
                currentSkillLevel,
                description,
                motivationStatement: motivation,
                deadline: new Date(deadline).toISOString(),
                impactScore: impactScore,
                additionalContext
            });
            setShowEdit(false);
            resetForm();
            mutate('/dreams');
        } catch (error) {
            console.error("Failed to update dream", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!selectedDream) return;
        setIsSubmitting(true);
        try {
            await api.delete(`/dreams/${selectedDream.id}`);
            setShowDelete(false);
            resetForm();
            mutate('/dreams');
        } catch (error) {
            console.error("Failed to archive dream", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <PageTransition>
            {(isLoading || isSubmitting) && <PageLoader />}
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <h2>Your Dreams</h2>
                    <GlowButton onClick={() => setShowCreate(true)}>
                        <RiAddLine style={{ marginRight: '8px' }} /> New Dream
                    </GlowButton>
                </div>

                <motion.div
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                >
                    {dreams.map((dream) => (
                        <div id={dream.id === 'mock-1' ? 'tour-roadmap' : undefined} key={dream.id}>
                        <GlassCard
                            variants={itemVariants}
                            whileHover={{ scale: 1.02 }}
                            style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
                        >
                            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); openEdit(dream); }}
                                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    <RiEditLine />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedDream(dream); setShowDelete(true); }}
                                    style={{ background: 'rgba(255,50,50,0.2)', border: 'none', color: '#ff6b6b', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    <RiDeleteBinLine />
                                </button>
                            </div>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--color-accent)', paddingRight: '60px' }}>{dream.title}</h3>
                            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px', flex: 1 }}>{dream.description}</p>

                            <div style={{
                                borderTop: '1px solid var(--glass-border)',
                                paddingTop: '16px',
                                marginTop: 'auto'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-gold)' }}>
                                    <RiFireLine />
                                    <span>"{dream.motivationStatement}"</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                                    <RiTimeLine />
                                    <span>{new Date(dream.deadline).toLocaleDateString()}</span>
                                </div>
                                <GlowButton 
                                    variant="ghost" 
                                    onClick={() => navigate(`/app/dreams/${dream.id}/roadmap`)}
                                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem' }}
                                >
                                    <RiRoadMapLine style={{ marginRight: '8px' }} /> View Roadmap
                                </GlowButton>
                            </div>
                        </GlassCard>
                        </div>
                    ))}
                </motion.div>

                {/* Create Modal Overlay */}
                <AnimatePresence>
                    {showCreate && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                background: 'rgba(0,0,0,0.8)',
                                backdropFilter: 'blur(5px)',
                                zIndex: 1000,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '16px'
                            }}
                            onClick={() => setShowCreate(false)}
                        >
                            <GlassCard
                                style={{ 
                                    width: '100%', 
                                    maxWidth: '550px', 
                                    maxHeight: '85vh', 
                                    overflowY: 'auto',
                                    paddingRight: '12px'
                                }}
                                className="custom-scrollbar"
                                onClick={(e) => e.stopPropagation()}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                            >
                                <h3 style={{ marginBottom: '24px' }}>Declare a New Dream</h3>
                                <form onSubmit={handleCreate}>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Title</label>
                                        <input
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            placeholder="e.g. Run a Marathon"
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Description</label>
                                        <textarea
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', resize: 'vertical' }}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            placeholder="What is this dream about?"
                                            rows={3}
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Domain</label>
                                            <input
                                                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                                value={domain}
                                                onChange={e => setDomain(e.target.value)}
                                                placeholder="e.g. Physics, Coding"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Current Skill Level</label>
                                            <input
                                                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                                value={currentSkillLevel}
                                                onChange={e => setCurrentSkillLevel(e.target.value)}
                                                placeholder="e.g. Beginner in Python, but expert in C++"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Target Goal</label>
                                        <input
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={targetGoal}
                                            onChange={e => setTargetGoal(e.target.value)}
                                            placeholder="What exactly do you want to achieve?"
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Additional Context</label>
                                        <textarea
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', resize: 'vertical' }}
                                            value={additionalContext}
                                            onChange={e => setAdditionalContext(e.target.value)}
                                            placeholder="Any other details that might help the AI?"
                                            rows={2}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Motivation Statement</label>
                                        <input
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={motivation}
                                            onChange={e => setMotivation(e.target.value)}
                                            placeholder="Why does this matter?"
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Target Date</label>
                                        <input
                                            type="date"
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={deadline}
                                            onChange={e => setDeadline(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                                            <span>Impact Score</span>
                                            <span style={{ color: 'var(--color-accent)', fontWeight: 'bold' }}>{impactScore}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="1"
                                            max="10"
                                            step="1"
                                            style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                                            value={impactScore}
                                            onChange={e => setImpactScore(parseInt(e.target.value))}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            <span>Nice to have</span>
                                            <span>Life-changing</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                                        <GlowButton type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</GlowButton>
                                        <GlowButton type="submit">Set This Dream</GlowButton>
                                    </div>
                                </form>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Edit Modal */}
                <AnimatePresence>
                    {showEdit && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 1000,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                            }}
                            onClick={() => setShowEdit(false)}
                        >
                            <GlassCard
                                style={{ 
                                    width: '100%', 
                                    maxWidth: '550px', 
                                    maxHeight: '85vh', 
                                    overflowY: 'auto',
                                    paddingRight: '12px' // space for scrollbar
                                }}
                                className="custom-scrollbar"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 style={{ marginBottom: '24px' }}>Edit Dream</h3>
                                <form onSubmit={handleUpdate}>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Title</label>
                                        <input
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Description</label>
                                        <textarea
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', resize: 'vertical' }}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            rows={3}
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Domain</label>
                                            <input
                                                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                                value={domain}
                                                onChange={e => setDomain(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Current Skill Level</label>
                                            <input
                                                style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                                value={currentSkillLevel}
                                                onChange={e => setCurrentSkillLevel(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Target Goal</label>
                                        <input
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={targetGoal}
                                            onChange={e => setTargetGoal(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Additional Context</label>
                                        <textarea
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', resize: 'vertical' }}
                                            value={additionalContext}
                                            onChange={e => setAdditionalContext(e.target.value)}
                                            rows={2}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Motivation Statement</label>
                                        <input
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={motivation}
                                            onChange={e => setMotivation(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Target Date</label>
                                        <input
                                            type="date"
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={deadline}
                                            onChange={e => setDeadline(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                                        <GlowButton type="button" variant="ghost" onClick={() => setShowEdit(false)}>Cancel</GlowButton>
                                        <GlowButton type="submit">Update Dream</GlowButton>
                                    </div>
                                </form>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Delete Confirmation Modal */}
                <AnimatePresence>
                    {showDelete && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 1000,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                            }}
                            onClick={() => setShowDelete(false)}
                        >
                            <GlassCard
                                style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 style={{ marginBottom: '16px' }}>Delete Dream?</h3>
                                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                                    “Dreams are long-term commitments. Are you sure you want to archive this dream?”
                                </p>
                                <p style={{ fontSize: '0.8rem', color: '#ff6b6b', marginBottom: '24px' }}>
                                    This will mark it as FAILED or ARCHIVED.
                                </p>
                                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                                    <GlowButton variant="ghost" onClick={() => setShowDelete(false)}>Cancel</GlowButton>
                                    <button
                                        onClick={confirmDelete}
                                        style={{
                                            background: '#ff6b6b', color: 'white', border: 'none',
                                            padding: '10px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer'
                                        }}
                                    >
                                        Archive Dream
                                    </button>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </PageTransition>
    );
};

export default DreamsPage;
