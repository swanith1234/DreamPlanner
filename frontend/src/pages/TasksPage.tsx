import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RiAddLine, RiCheckDoubleLine, RiLoader4Line } from 'react-icons/ri';
import api from '../api/client';
import GlassCard from '../components/GlassCard';
import GlowButton from '../components/GlowButton';
import PageTransition from '../components/PageTransition';
import PageLoader from '../components/PageLoader';
import Skeleton from '../components/ui/Skeleton';
import useSWR from 'swr';
import { useTour } from '../context/TourContext';
import { MOCK_TOUR_DATA } from '../utils/mockTourData';

const fetcher = (url: string) => api.get(url).then(res => res.data);

interface Task {
    id: string;
    title: string;
    deadline: string;
    priority: number;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    progressPercent?: number;
}

interface Dream {
    id: string;
    title: string;
}

interface Checkpoint {
    title: string;
    targetDate: string;
    orderIndex: number;
}

const TasksPage: React.FC = () => {
    const navigate = useNavigate();
    
    const { isTourMode } = useTour();

    // SWR Data Fetching
    const { data: dreamsRes, isLoading: dreamsLoading } = useSWR(isTourMode ? null : '/dreams', fetcher);
    const { data: tasksRes, isLoading: tasksLoading, mutate: mutateTasks } = useSWR(isTourMode ? null : '/tasks', fetcher);

    // Tour mode mock states
    const [mockDreams, setMockDreams] = useState<Dream[]>([]);
    const [mockTasks, setMockTasks] = useState<Task[]>([]);

    const dreams: Dream[] = isTourMode ? mockDreams : (dreamsRes?.dreams || []);
    const tasks: Task[] = isTourMode ? mockTasks : (tasksRes?.tasks || []);
    
    const [showCreate, setShowCreate] = useState(false);

    // Filter
    const [filter, setFilter] = useState<'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('PENDING');

    // Form State
    const [title, setTitle] = useState('');
    const [selectedDreamId, setSelectedDreamId] = useState('');
    const [deadline, setDeadline] = useState('');
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (deadline) {
            generateCheckpoints(deadline);
        } else {
            setCheckpoints([]);
        }
    }, [deadline]);

    const generateCheckpoints = (targetDate: string) => {
        const today = new Date();
        const end = new Date(targetDate);
        today.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        if (today >= end) {
            setCheckpoints([]); // Deadline must be in future
            return;
        }

        const generated: Checkpoint[] = [];
        let order = 1;
        // Start from today or tomorrow? Usually checkpoints implies intermediate steps.
        // Requirement: "generate the placeholders to enter the checkpoints for each day"
        // Loop from today until the day BEFORE deadline? or INCLUDING deadline?
        // Assuming inclusive of daily progress tracking up to deadline.

        const current = new Date(today);
        while (current <= end) {
            const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
            generated.push({
                title: '',
                targetDate: dateStr,
                orderIndex: order++
            });
            current.setDate(current.getDate() + 1);
        }
        setCheckpoints(generated);
    };

    useEffect(() => {
        if (isTourMode) {
            setMockDreams([{ id: 'mock-1', title: MOCK_TOUR_DATA.roadmap.dreamTitle }]);
            setMockTasks(
                MOCK_TOUR_DATA.dailyTasks.tasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    deadline: new Date().toISOString(),
                    priority: 1,
                    status: t.progress === 100 ? 'COMPLETED' : 'PENDING',
                    progressPercent: t.progress,
                    dreamId: 'mock-1'
                })) as any
            );
        }
    }, [isTourMode]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/tasks', {
                dreamId: selectedDreamId,
                title,
                deadline: new Date(deadline).toISOString(),
                priority: 1,
                checkpoints: checkpoints.filter(c => c.title.trim() !== '') // Send only filled checkpoints? Or strict? 
                // Let's send all if meaningful, or maybe let user fill them.
                // If they are placeholders, we expect user to fill them.
            });
            setShowCreate(false);
            setTitle('');
            setDeadline('');
            setCheckpoints([]);
            mutateTasks();
        } catch (error) {
            console.error("Failed to create task", error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (progress: number) => {
        if (progress === 100) return <RiCheckDoubleLine color="var(--color-success)" />;
        if (progress > 0) return <RiLoader4Line className="spin" color="var(--color-accent)" />;
        return <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid var(--color-text-secondary)' }} />;
    };

    // Group tasks by dream if needed, or just list them. 
    // Requirement says "Grouped by Dream".
    const getTasksByFilter = (tasksList: Task[]) => tasksList.filter(t => {
        const progress = t.progressPercent || 0;
        if (filter === 'PENDING') return progress === 0;
        if (filter === 'IN_PROGRESS') return progress > 0 && progress < 100;
        if (filter === 'COMPLETED') return progress === 100;
        return false;
    });

    const groupedTasks = dreams.map(dream => ({
        ...dream,
        tasks: getTasksByFilter(tasks).filter(t => (t as any).dreamId === dream.id)
    })).filter(group => group.tasks.length > 0);

    // Fallback if no specific relation shown in UI easily without dreamId in task object
    // For now I'll trust the plan and assume.

    return (
        <PageTransition>
            {loading && <PageLoader />}
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <h2>Mission Log</h2>
                    <GlowButton onClick={() => setShowCreate(true)}>
                        <RiAddLine style={{ marginRight: '8px' }} /> New Mission
                    </GlowButton>
                </div>

                {/* Status Tabs */}
                <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
                    {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status as any)}
                            style={{
                                background: 'transparent',
                                color: filter === status ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                fontWeight: filter === status ? 600 : 400,
                                textTransform: 'capitalize',
                                position: 'relative',
                                padding: '4px 8px'
                            }}
                        >
                            {status.toLowerCase().replace('_', ' ')}
                            {filter === status && (
                                <motion.div
                                    layoutId="active-tab"
                                    style={{
                                        position: 'absolute', bottom: -17, left: 0, right: 0, height: '2px', background: 'var(--color-accent)'
                                    }}
                                />
                            )}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {/* Skeletons while Loading */}
                    {(dreamsLoading || tasksLoading) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                            {[1, 2].map((groupKey) => (
                                <div key={groupKey}>
                                    <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                        <Skeleton className="w-[8px] h-[8px] rounded-full mr-[8px]" />
                                        <Skeleton className="w-[140px] h-[20px]" />
                                    </h3>
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        {[1, 2, 3].map((taskKey) => (
                                            <GlassCard key={taskKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                                                    <Skeleton className="w-[16px] h-[16px] rounded-full flex-shrink-0" />
                                                    <div className="flex-1 space-y-2">
                                                        <Skeleton className="w-[200px] h-[16px]" />
                                                        <Skeleton className="w-[120px] h-[12px]" />
                                                    </div>
                                                </div>
                                            </GlassCard>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        groupedTasks.map(group => (
                            <div key={group.id} id={group.id === 'mock-1' ? 'tour-daily-tasks' : undefined}>
                                <h3 style={{ fontSize: '1.1rem', color: 'var(--color-text-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ width: '8px', height: '8px', background: 'var(--color-gold)', borderRadius: '50%', marginRight: '8px' }} />
                                    {group.title}
                                </h3>
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    {group.tasks.map((task) => (
                                        (task as any).dreamId === group.id && (
                                            <GlassCard
                                                key={task.id}
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', cursor: 'pointer' }}
                                                whileHover={{ x: 4 }}
                                                onClick={() => navigate(`/app/tasks/${task.id}`)}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                    {getStatusIcon(task.progressPercent || 0)}
                                                    <div>
                                                        <div style={{ fontWeight: 500 }}>{task.title}</div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                            Due: {new Date(task.deadline).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </GlassCard>
                                        )
                                    ))}
                                </div>
                            </div>
                        ))
                    )}

                    {(!dreamsLoading && !tasksLoading && groupedTasks.length === 0) && (
                        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-secondary)' }}>
                            No {filter.toLowerCase().replace('_', ' ')} missions found.
                        </div>
                    )}
                </div>

                {/* Create Modal */}
                <AnimatePresence>
                    {showCreate && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 1000,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                            }}
                            onClick={() => setShowCreate(false)}
                        >
                            <GlassCard
                                style={{ width: '100%', maxWidth: '500px' }}
                                onClick={(e) => e.stopPropagation()}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                            >
                                <h3 style={{ marginBottom: '24px' }}>New Mission</h3>
                                <form onSubmit={handleCreate}>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px' }}>Dream Context</label>
                                        <select
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={selectedDreamId}
                                            onChange={e => setSelectedDreamId(e.target.value)}
                                            required
                                        >
                                            <option value="" disabled>Select a Dream</option>
                                            {dreams.map(d => <option key={d.id} value={d.id} style={{ color: 'black' }}>{d.title}</option>)}
                                        </select>
                                    </div>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px' }}>Mission Title</label>
                                        <input
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            placeholder="e.g. Run 5km today"
                                            required
                                        />
                                    </div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px' }}>Deadline</label>
                                        <input
                                            type="date"
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                            value={deadline}
                                            onChange={e => setDeadline(e.target.value)}
                                            required
                                        />
                                    </div>

                                    {checkpoints.length > 0 && (
                                        <div style={{ marginBottom: '24px', maxHeight: '200px', overflowY: 'auto' }}>
                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Daily Checkpoints</label>
                                            {checkpoints.map((cp, index) => (
                                                <div key={index} style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', minWidth: '80px' }}>
                                                        {new Date(cp.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    </span>
                                                    <input
                                                        style={{ flex: 1, padding: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none', fontSize: '0.9rem' }}
                                                        placeholder={`Goal for this day...`}
                                                        value={cp.title}
                                                        onChange={(e) => {
                                                            const newCheckpoints = [...checkpoints];
                                                            newCheckpoints[index].title = e.target.value;
                                                            setCheckpoints(newCheckpoints);
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                                        <GlowButton type="button" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</GlowButton>
                                        <GlowButton type="submit">Assign Mission</GlowButton>
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

export default TasksPage;
