import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR, { mutate } from 'swr';
import {
    RiArrowLeftLine, RiTimeLine, RiCheckboxCircleLine,
    RiEditLine, RiDeleteBinLine,
    RiCheckDoubleLine
} from 'react-icons/ri';
import api from '../api/client';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import PageTransition from '../components/PageTransition';
import PageLoader from '../components/PageLoader';

interface TaskCheckpoint {
    id: string;
    title: string;
    targetDate: string;
    isCompleted: boolean;
    progress: number;
    orderIndex: number;
    isActive: boolean;  // server-derived: true only for the first incomplete checkpoint
}

interface Task {
    id: string;
    title: string;
    description?: string;
    deadline: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'ARCHIVED';
    progressPercent: number;
    checkpoints: TaskCheckpoint[];
    dream?: {
        id: string;
        title: string;
    };
}

const TaskDetailPage: React.FC = () => {
    const { taskId } = useParams<{ taskId: string }>();
    const navigate = useNavigate();
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const isMobile = windowWidth < 768;

    // SWR for deduplicated fetching
    const { data: task, error, isLoading } = useSWR<Task>(
        taskId ? `/tasks/${taskId}` : null,
        url => api.get(url).then(res => res.data),
        {
            revalidateOnFocus: false,
            dedupingInterval: 5000
        }
    );

    // Edit Task State
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editDeadline, setEditDeadline] = useState('');

    // Edit state
    const [editingCheckpoint, setEditingCheckpoint] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [deletingCheckpointId, setDeletingCheckpointId] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (task) {
            setEditTitle(task.title);
            setEditDescription(task.description || '');
            setEditDeadline(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');
        }
    }, [task]);

    const handleCycleProgress = async (cp: TaskCheckpoint) => {
        if (!cp.isActive || !task) return;

        try {
            const newProgress = Math.min(cp.progress + 25, 100);
            const delta = newProgress - cp.progress;
            const now = new Date();
            const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            
            // Optimistic update
            const updatedCheckpoints = task.checkpoints.map(c =>
                c.id === cp.id
                    ? { ...c, progress: newProgress, isCompleted: newProgress === 100, isActive: newProgress < 100 }
                    : c
            );
            const totalProgressSum = updatedCheckpoints.reduce((sum, c) => sum + Math.min(c.progress || 0, 100), 0);
            const newTotalProgress = updatedCheckpoints.length > 0 ? Math.round(totalProgressSum / updatedCheckpoints.length) : 0;
            
            mutate(`/tasks/${taskId}`, { ...task, checkpoints: updatedCheckpoints, progressPercent: newTotalProgress }, false);

            await api.post(`/tasks/${task.id}/checkpoints/${cp.id}/progress`, { delta, localDate });
            mutate(`/tasks/${taskId}`);
        } catch (error) {
            console.error('Failed to update progress', error);
            mutate(`/tasks/${taskId}`);
        }
    };

    const handleSaveCheckpoint = async (checkpointId: string) => {
        try {
            await api.put(`/tasks/${task?.id}/checkpoints/${checkpointId}`, {
                title: editValue
            });
            setEditingCheckpoint(null);
            mutate(`/tasks/${taskId}`);
        } catch (error) {
            console.error("Failed to update checkpoint", error);
        }
    };

    const handleDeleteTask = async () => {
        setIsSubmitting(true);
        try {
            await api.delete(`/tasks/${taskId}`);
            mutate('/tasks');
            navigate('/app/tasks');
        } catch (error) {
            console.error("Failed to delete task", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteCheckpoint = async () => {
        if (!deletingCheckpointId || !task) return;
        setIsSubmitting(true);
        try {
            await api.delete(`/tasks/${task.id}/checkpoints/${deletingCheckpointId}`);
            setDeletingCheckpointId(null);
            mutate(`/tasks/${taskId}`);
        } catch (error) {
            console.error('Failed to delete checkpoint', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await api.put(`/tasks/${taskId}`, {
                title: editTitle,
                description: editDescription,
                deadline: new Date(editDeadline).toISOString()
            });
            setShowEditModal(false);
            mutate(`/tasks/${taskId}`);
        } catch (error) {
            console.error("Failed to update task", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading || isSubmitting) return <PageLoader />;
    if (error || !task) return <div style={{ padding: '2rem', color: 'white' }}>Task not found</div>;

    const getDerivedStatus = (progress: number) => {
        if (progress === 100) return 'COMPLETED';
        if (progress > 0) return 'IN PROGRESS';
        return 'PENDING';
    };

    const derivedStatus = getDerivedStatus(task.progressPercent || 0);
    const isCompleted = derivedStatus === 'COMPLETED';
    const progressColor = isCompleted ? '#4CAF50' : '#4F46E5'; 

    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - ((task.progressPercent || 0) / 100) * circumference;

    return (
        <PageTransition>
            <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>
                <button
                    onClick={() => navigate('/app/tasks')}
                    style={{
                        background: 'none', border: 'none', color: 'var(--color-text-secondary)',
                        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px',
                        cursor: 'pointer', padding: 0
                    }}
                >
                    <RiArrowLeftLine /> Back to Missions
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 350px', gap: '32px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <GlassCard style={{ padding: '32px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'relative', zIndex: 2 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                                    <div>
                                        {task.dream && (
                                            <div style={{
                                                fontSize: '0.85rem', color: 'var(--color-gold)',
                                                marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px'
                                            }}>
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }}></span>
                                                {task.dream.title}
                                            </div>
                                        )}
                                        <h1 style={{ fontSize: '2rem', marginBottom: '8px', lineHeight: 1.2 }}>{task.title}</h1>
                                        {task.description && (
                                            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{task.description}</p>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => setShowEditModal(true)}
                                            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                                        >
                                            <RiEditLine size={20} />
                                        </button>
                                        <button
                                            onClick={() => setShowDeleteModal(true)}
                                            style={{ background: 'rgba(255,50,50,0.1)', border: 'none', color: '#ff6b6b', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                                        >
                                            <RiDeleteBinLine size={20} />
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)' }}>
                                        <RiTimeLine />
                                        <span>Due {new Date(task.deadline).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                    <div style={{
                                        padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
                                        background: isCompleted ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 255, 255, 0.1)',
                                        color: isCompleted ? '#66bb6a' : 'white',
                                        border: isCompleted ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        {derivedStatus}
                                    </div>
                                </div>
                            </div>
                        </GlassCard>

                        <div style={{ position: 'relative', paddingLeft: '16px' }}>
                            <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <RiCheckDoubleLine color="#4F46E5" /> Mission Checkpoints
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                {task.checkpoints.map((cp, index) => {
                                    const isLast = index === task.checkpoints.length - 1;
                                    const isPast = new Date(cp.targetDate) < new Date() && !cp.isCompleted;

                                    return (
                                        <div key={cp.id} style={{ display: 'flex', gap: '20px', position: 'relative', paddingBottom: isLast ? 0 : '32px' }}>
                                            {!isLast && (
                                                <div style={{
                                                    position: 'absolute', left: '11px', top: '28px', bottom: '0', width: '2px',
                                                    background: cp.isCompleted ? '#4F46E5' : 'rgba(255,255,255,0.1)'
                                                }} />
                                            )}

                                            {(() => {
                                                const isActive = cp.isActive;
                                                const isDone = cp.isCompleted;
                                                const isLocked = !isDone && !isActive;
                                                return (
                                                    <div
                                                        onClick={isActive ? () => handleCycleProgress(cp) : undefined}
                                                        title={isLocked ? 'Complete the current active checkpoint first' : undefined}
                                                        style={{
                                                            zIndex: 2,
                                                            cursor: isActive ? 'pointer' : isDone ? 'default' : 'not-allowed',
                                                            opacity: isLocked ? 0.35 : 1,
                                                            filter: isLocked ? 'grayscale(0.7)' : 'none',
                                                            width: '32px', height: '32px', borderRadius: '50%',
                                                            background: 'rgba(30,30,40,1)',
                                                            position: 'relative',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            flexShrink: 0,
                                                            transition: 'opacity 0.2s, filter 0.2s',
                                                        }}
                                                    >
                                                        <svg width="32" height="32" style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
                                                            <circle
                                                                cx="16" cy="16" r="14"
                                                                stroke="rgba(255,255,255,0.1)" strokeWidth="3" fill="transparent"
                                                            />
                                                            <motion.circle
                                                                initial={false}
                                                                animate={{ strokeDashoffset: 88 - (88 * (cp.progress || 0)) / 100 }}
                                                                transition={{ duration: 0.3 }}
                                                                cx="16" cy="16" r="14"
                                                                stroke={cp.progress === 100 ? '#4CAF50' : isActive ? '#4F46E5' : '#888'}
                                                                strokeWidth="3" fill="transparent"
                                                                strokeDasharray="88"
                                                                strokeLinecap="round"
                                                            />
                                                        </svg>
                                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'white', zIndex: 3 }}>
                                                            {cp.progress === 100 ? (
                                                                <RiCheckboxCircleLine color="#4CAF50" size={16} />
                                                            ) : (
                                                                cp.progress > 0 ? `${cp.progress}%` : isLocked ? '🔒' : ''
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            <div style={{ flex: 1, marginTop: '-2px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                                    {editingCheckpoint === cp.id ? (
                                                        <div style={{ flex: 1, marginRight: '16px' }}>
                                                            <input
                                                                autoFocus
                                                                className="glass-input"
                                                                value={editValue}
                                                                onChange={(e) => setEditValue(e.target.value)}
                                                                onBlur={() => handleSaveCheckpoint(cp.id)}
                                                                onKeyDown={(e) => e.key === 'Enter' && handleSaveCheckpoint(cp.id)}
                                                                style={{
                                                                    width: '100%', padding: '8px', background: 'rgba(255,255,255,0.05)',
                                                                    border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white'
                                                                }}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div
                                                            onClick={() => { setEditingCheckpoint(cp.id); setEditValue(cp.title); }}
                                                            style={{
                                                                cursor: 'text',
                                                                textDecoration: cp.isCompleted ? 'line-through' : 'none',
                                                                color: cp.isCompleted ? 'rgba(255,255,255,0.4)' : 'white',
                                                                fontWeight: 400, fontSize: '1.05rem'
                                                            }}
                                                        >
                                                            {cp.title}
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <div
                                                            style={{
                                                                fontSize: '0.85rem',
                                                                color: cp.isCompleted ? 'rgba(255,255,255,0.3)' : (isPast ? '#ff6b6b' : 'var(--color-text-secondary)')
                                                            }}
                                                        >
                                                            {new Date(cp.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDeletingCheckpointId(cp.id); }}
                                                            title="Delete checkpoint"
                                                            style={{
                                                                background: 'rgba(255,50,50,0.08)',
                                                                border: 'none', color: '#ff6b6b',
                                                                padding: '3px 6px', borderRadius: '4px',
                                                                cursor: 'pointer', fontSize: '0.75rem', lineHeight: 1,
                                                                display: 'flex', alignItems: 'center'
                                                            }}
                                                        >
                                                            <RiDeleteBinLine size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div>
                        <GlassCard style={{ padding: '32px', textAlign: 'center', position: 'sticky', top: '24px' }}>
                            <h3 style={{ marginBottom: '24px' }}>Progress Overview</h3>
                            <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto 24px' }}>
                                <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
                                    <circle stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="transparent" r={radius} cx="80" cy="80" />
                                    <motion.circle
                                        initial={{ strokeDashoffset: circumference }}
                                        animate={{ strokeDashoffset }}
                                        transition={{ duration: 1, ease: 'easeOut' }}
                                        stroke={progressColor} strokeWidth="8" strokeLinecap="round" fill="transparent" r={radius} cx="80" cy="80" strokeDasharray={circumference}
                                    />
                                </svg>
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <span style={{ fontSize: '2rem', fontWeight: 700 }}>{task.progressPercent}%</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Completed</span>
                                </div>
                            </div>
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                "Progress reflects what you’ve shared so far."
                            </p>
                        </GlassCard>
                    </div>
                </div>

                <AnimatePresence>
                    {showDeleteModal && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                            onClick={() => setShowDeleteModal(false)}
                        >
                            <GlassCard style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <h3 style={{ marginBottom: '16px' }}>Delete Mission?</h3>
                                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>This will stop reminders for this task. Continue?</p>
                                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                                    <GlowButton variant="ghost" onClick={() => setShowDeleteModal(false)}>Cancel</GlowButton>
                                    <button onClick={handleDeleteTask} style={{ background: '#ff6b6b', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {deletingCheckpointId && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                            onClick={() => setDeletingCheckpointId(null)}
                        >
                            <GlassCard style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <h3 style={{ marginBottom: '16px' }}>Delete Checkpoint?</h3>
                                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>This will permanently delete this checkpoint and all its daily progress entries.</p>
                                <p style={{ fontSize: '0.8rem', color: '#ff6b6b', marginBottom: '24px' }}>⚠️ This action cannot be undone.</p>
                                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                                    <GlowButton variant="ghost" onClick={() => setDeletingCheckpointId(null)}>Cancel</GlowButton>
                                    <button onClick={handleDeleteCheckpoint} style={{ background: '#ff6b6b', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Delete Checkpoint</button>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showEditModal && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                            onClick={() => setShowEditModal(false)}
                        >
                            <GlassCard style={{ width: '100%', maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                                <h3 style={{ marginBottom: '24px' }}>Edit Mission</h3>
                                <form onSubmit={handleUpdateTask}>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Title</label>
                                        <input style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }} value={editTitle} onChange={e => setEditTitle(e.target.value)} required />
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Description</label>
                                        <textarea style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', resize: 'vertical' }} value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
                                    </div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Deadline</label>
                                        <input type="date" style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }} value={editDeadline} onChange={e => setEditDeadline(e.target.value)} required />
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                                        <GlowButton type="button" variant="ghost" onClick={() => setShowEditModal(false)}>Cancel</GlowButton>
                                        <GlowButton type="submit">Update Mission</GlowButton>
                                    </div>
                                </form>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </PageTransition>
    );
};

export default TaskDetailPage;
