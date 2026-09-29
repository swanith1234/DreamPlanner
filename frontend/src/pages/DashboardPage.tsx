import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import { analyticsApi, type SprintDashboard } from '../api/analytics';
import {
    RiTrophyFill, RiFlashlightFill, RiCheckboxCircleFill,
    RiAlertFill, RiArrowUpLine, RiCalendarCheckFill,

} from 'react-icons/ri';
import { useTour } from '../context/TourContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Append T00:00:00 so YYYY-MM-DD strings are parsed as local midnight, not UTC
const fmt = (dateStr: string) =>
    new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const pct = (n: number) => `${Math.round(n)}%`;

function getVerdict(score: number) {
    if (score >= 85) return { label: 'Outstanding Week', sub: "You're on Fire!", icon: '🔥', color: '#ff6b35' };
    if (score >= 70) return { label: 'Strong Performance', sub: 'Keep the momentum!', icon: '⚡', color: '#6c63ff' };
    if (score >= 55) return { label: 'Solid Effort', sub: 'Room to push harder.', icon: '💪', color: '#00d4ff' };
    return { label: 'Keep Going', sub: 'Every step counts.', icon: '🎯', color: '#ffd700' };
}

// ─── Particle burst (canvas, lightweight) ────────────────────────────────────

const ParticleCanvas: React.FC<{ trigger: boolean }> = ({ trigger }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!trigger) return;
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
        const particles = Array.from({ length: 40 }, () => ({
            x: canvas.width / 2, y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
            r: Math.random() * 3 + 1,
            color: ['#6c63ff', '#00d4ff', '#ffd700', '#ff6b35'][Math.floor(Math.random() * 4)],
            life: 1,
        }));
        let raf: number;
        const frame = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.life -= 0.02; p.vy += 0.1;
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.fillStyle = p.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            });
            if (particles.some(p => p.life > 0)) raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [trigger]);
    return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
};

// ─── Discipline Score Gauge ───────────────────────────────────────────────────

const HoloGauge: React.FC<{ value: number }> = ({ value }) => {
    const [display, setDisplay] = useState(0);
    const [burst, setBurst] = useState(false);
    useEffect(() => {
        let current = 0;
        const step = value / 60;
        const t = setInterval(() => {
            current = Math.min(current + step, value);
            setDisplay(Math.round(current));
            if (current >= value) { clearInterval(t); setBurst(true); }
        }, 16);
        return () => clearInterval(t);
    }, [value]);

    const r = 80; const circ = 2 * Math.PI * r;
    const dash = circ - (display / 100) * circ;
    const color = value >= 85 ? '#00ff9d' : value >= 70 ? '#6c63ff' : value >= 55 ? '#00d4ff' : '#ffd700';

    return (
        <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ParticleCanvas trigger={burst} />
            {/* Outer glow ring */}
            <svg width="220" height="220" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>
                {/* Track */}
                <circle cx="110" cy="110" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="16" />
                {/* Progress */}
                <motion.circle
                    cx="110" cy="110" r={r} fill="none"
                    stroke={color} strokeWidth="16" strokeLinecap="round"
                    strokeDasharray={circ}
                    initial={{ strokeDashoffset: circ }}
                    animate={{ strokeDashoffset: dash }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    filter="url(#glow)"
                />
                {/* Tick marks */}
                {Array.from({ length: 20 }, (_, i) => {
                    const angle = (i / 20) * 360;
                    const rad = (angle * Math.PI) / 180;
                    const x1 = 110 + 95 * Math.cos(rad); const y1 = 110 + 95 * Math.sin(rad);
                    const x2 = 110 + 88 * Math.cos(rad); const y2 = 110 + 88 * Math.sin(rad);
                    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />;
                })}
            </svg>
            {/* Center text */}
            <div style={{ textAlign: 'center', zIndex: 2 }}>
                <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ fontSize: '3rem', fontWeight: 900, lineHeight: 1, color, textShadow: `0 0 20px ${color}80` }}
                >
                    {display}
                </motion.div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginTop: 2 }}>DISCIPLINE SCORE</div>
            </div>
        </div>
    );
};

// ─── Bar chart (daily effort) ─────────────────────────────────────────────────

const EffortChart: React.FC<{ dailyEffort: Record<string, number>; overachievementDays: number }> = ({ dailyEffort, overachievementDays: _overachievementDays }) => {
    const entries = Object.entries(dailyEffort);
    const maxVal = Math.max(120, ...entries.map(([, v]) => v)); // Headroom above 100
    const TARGET = 100;

    const CHART_H = 140; // max bar body height
    const CAP = 6;       // half-height of the narrower ellipse caps

    const barColor = (v: number) =>
        v === 0 ? 'rgba(255,255,255,0.08)'
            : v >= TARGET ? '#00ff9d'
                : v >= TARGET * 0.7 ? '#6c63ff'
                    : '#ff6b35';

    return (
        <div style={{ position: 'relative', padding: `${CAP * 2 + 20}px 0 0` }}>
            {/* Target 100 line */}
            <div style={{
                position: 'absolute',
                top: `${CAP * 2 + 20 + (1 - TARGET / maxVal) * CHART_H}px`,
                left: 0, right: 0,
                borderTop: '1px dashed rgba(255,255,255,0.3)',
                zIndex: 2, pointerEvents: 'none',
            }}>
                <span style={{ position: 'absolute', right: 0, top: -14, fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>100 pts</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: CHART_H + CAP * 4 + 28 }}>
                {entries.map(([date, value], i) => {
                    const bodyH = value === 0 ? 4 : Math.max((value / maxVal) * CHART_H, 12);
                    const totalH = bodyH + CAP * 2; // body + top cap + bottom cap
                    const color = barColor(value);
                    const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
                    const empty = value === 0;

                    return (
                        <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                            {/* ── Cylinder wrapper (animated height) with hologram flicker ── */}
                            <motion.div
                                title={`${value} pts`}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: totalH, opacity: [0, 1] }}
                                transition={{ duration: 0.75, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
                                style={{ position: 'relative', width: '36px', overflow: 'visible', cursor: 'default', marginBottom: 8 }}
                            >
                                {/* Flicker overlay for the whole cylinder */}
                                {!empty && (
                                    <motion.div
                                        animate={{ opacity: [1, 0.88, 1, 0.93, 1, 0.91, 1] }}
                                        transition={{ duration: 4.5, repeat: Infinity, ease: 'linear', delay: i * 0.55 }}
                                        style={{
                                            position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
                                            background: `radial-gradient(ellipse at 50% 50%, transparent 60%, ${color}08 100%)`
                                        }}
                                    />
                                )}

                                {/* Value label — floats above top cap */}
                                {value > 0 && (
                                    <motion.span
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.09 + 0.55 }}
                                        style={{
                                            position: 'absolute', top: -(CAP + 16),
                                            left: '50%', transform: 'translateX(-50%)',
                                            fontSize: '0.58rem', color, fontWeight: 700, whiteSpace: 'nowrap',
                                            textShadow: `0 0 8px ${color}`,
                                        }}
                                    >{value}</motion.span>
                                )}

                                {/* ── Top hollow ring cap ── */}
                                <div style={{
                                    position: 'absolute', top: 0,
                                    left: '-8%', right: '-8%', height: CAP * 2,
                                    borderRadius: '50%',
                                    background: empty
                                        ? 'rgba(255,255,255,0.04)'
                                        : `radial-gradient(ellipse at 50% 50%,
                                            transparent 0%,
                                            transparent 48%,
                                            ${color}40 54%,
                                            ${color}ff 68%,
                                            ${color}ff 75%,
                                            ${color}50 84%,
                                            transparent 94%)`,
                                    boxShadow: empty ? 'none' : `0 0 18px ${color}cc, 0 -4px 24px ${color}80`,
                                    zIndex: 3,
                                }} />

                                {/* ── Cylinder body — hollow tube with horizontal gridlines ── */}
                                <div style={{
                                    position: 'absolute',
                                    top: CAP, bottom: CAP, left: 0, right: 0,
                                    background: empty
                                        ? 'rgba(255,255,255,0.02)'
                                        : [
                                            // Horizontal scan-line grid
                                            `repeating-linear-gradient(to bottom,
                                                transparent 0px, transparent 6px,
                                                ${color}22 6px, ${color}22 7px)`,
                                            // Hollow tube: bright edges, transparent center
                                            `linear-gradient(to right,
                                                ${color}ff 0%,
                                                ${color}88 4%,
                                                ${color}18 12%,
                                                ${color}08 50%,
                                                ${color}18 88%,
                                                ${color}88 96%,
                                                ${color}ff 100%)`,
                                        ].join(', '),
                                    boxShadow: empty ? 'none'
                                        : `-1px 0 14px ${color}90, 1px 0 14px ${color}90, 0 0 8px ${color}30`,
                                }} />

                                {/* ── Bottom hollow ring cap ── */}
                                <div style={{
                                    position: 'absolute', bottom: 0,
                                    left: '-8%', right: '-8%', height: CAP * 2,
                                    borderRadius: '50%',
                                    background: empty
                                        ? 'rgba(255,255,255,0.02)'
                                        : `radial-gradient(ellipse at 50% 50%,
                                            transparent 0%,
                                            transparent 52%,
                                            ${color}30 58%,
                                            ${color}cc 70%,
                                            ${color}55 80%,
                                            transparent 92%)`,
                                    boxShadow: empty ? 'none' : `0 0 10px ${color}60`,
                                    zIndex: 3,
                                }} />
                            </motion.div>

                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                                {dayLabel}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Rate pill ────────────────────────────────────────────────────────────────

const RatePill: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
        <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
            <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="18" cy="18" r="14" fill="none" stroke={`${color}20`} strokeWidth="3" />
                <motion.circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={88}
                    initial={{ strokeDashoffset: 88 }}
                    animate={{ strokeDashoffset: 88 - (88 * value) / 100 }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                />
            </svg>
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', color, fontWeight: 700 }}>
                {value}%
            </span>
        </div>
        <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{label}</div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 1, ease: 'easeOut' }}
                    style={{ height: '100%', borderRadius: 2, background: color, boxShadow: `0 0 8px ${color}` }} />
            </div>
        </div>
        <span style={{ fontSize: '1rem', fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>{pct(value)}</span>
    </div>
);

// ─── Score pill ───────────────────────────────────────────────────────────────

const ScorePill: React.FC<{ label: string; value: number; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
    <div style={{
        background: `linear-gradient(135deg, ${color}12, ${color}06)`,
        border: `1px solid ${color}30`, borderRadius: 12, padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
    }}>
        <div style={{ fontSize: '1.3rem', color }}>{icon}</div>
        <div>
            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value}<span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'rgba(255,255,255,0.4)', marginLeft: 2 }}>/100</span></div>
        </div>
    </div>
);

// ─── Checkpoint category tile ─────────────────────────────────────────────────

const CpTile: React.FC<{ label: string; count: number; icon: React.ReactNode; color: string; sub?: string }> = ({ label, count, icon, color, sub }) => (
    <motion.div
        whileHover={{ scale: 1.03, y: -3 }}
        style={{
            background: `linear-gradient(135deg, ${color}18, ${color}08)`,
            border: `1px solid ${color}35`, borderRadius: 14, padding: '16px 18px',
            display: 'flex', flexDirection: 'column', gap: 6, cursor: 'default',
            boxShadow: `0 4px 20px ${color}15`,
        }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
            <span style={{ color, fontSize: '1.1rem' }}>{icon}</span>
        </div>
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ fontSize: '2.4rem', fontWeight: 900, color, lineHeight: 1, textShadow: `0 0 20px ${color}80` }}
        >
            {count}
        </motion.div>
        {sub && <div style={{ fontSize: '0.65rem', color: `${color}90` }}>{sub}</div>}
    </motion.div>
);

// ─── Glass card ───────────────────────────────────────────────────────────────

const GlassCard: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
    <div style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: 24,
        ...style,
    }}>
        {children}
    </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1.5 }}>{children}</h3>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    const [selectedSprint, setSelectedSprint] = useState<string>('current');
    const { isTourMode } = useTour();

    useEffect(() => {
        const onResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const isMobile = windowWidth < 768;

    // Fetch past sprints
    const { data: sprints = [] } = useSWR(
        !isTourMode ? '/analytics/sprints' : null,
        () => analyticsApi.listSprints()
    );

    // Fetch dashboard data
    const { data: dashboardData, error, isLoading } = useSWR(
        isTourMode ? null : ['/analytics/dashboard', selectedSprint],
        ([_, sprint]) => {
            if (sprint === 'current') {
                return analyticsApi.getWeeklyDashboard();
            } else {
                return analyticsApi.getSprintByWeekStart(sprint).then((snapshot: any) => {
                    const onTime = Math.max(0, snapshot.totalCheckpointsCompleted - snapshot.earlyStarts - snapshot.recovered);
                    return {
                        sprintWindow: {
                            start: snapshot.weekStart.slice(0, 10),
                            end: snapshot.weekEnd.slice(0, 10),
                        },
                        checkpoints: {
                            planned: { count: snapshot.totalCheckpointsPlanned, items: [] },
                            earlyCompleted: { count: snapshot.earlyStarts, items: [] },
                            onTimeCompleted: { count: onTime, items: [] },
                            recovered: { count: snapshot.recovered, items: [] },
                            overduePending: { count: snapshot.overduePending, items: [] },
                        },
                        rates: {
                            executionRate: snapshot.executionRate,
                            recoveryRate: snapshot.recoveryRate,
                        },
                        activity: {
                            activeDays: snapshot.activeDays,
                            missedDays: snapshot.missedDays,
                            overachievementDays: snapshot.overachievementDays,
                            totalEffort: Object.values(snapshot.dailyEffort || {}).reduce((a: any, b: any) => a + Number(b), 0) as number,
                            dailyEffort: snapshot.dailyEffort || {},
                        },
                        scores: {
                            consistency: snapshot.consistencyScore,
                            intensity: snapshot.intensityScore,
                            disciplineScore: snapshot.disciplineScore,
                        },
                    };
                });
            }
        },
        {
            revalidateOnFocus: false,
            dedupingInterval: 5000
        }
    );

    // Mock data for tour mode
    const tourData: SprintDashboard = {
        sprintWindow: { start: '2026-04-14', end: '2026-04-20' },
        checkpoints: {
            planned: { count: 12, items: [] },
            earlyCompleted: { count: 2, items: [] },
            onTimeCompleted: { count: 8, items: [] },
            recovered: { count: 2, items: [] },
            overduePending: { count: 0, items: [] },
        },
        rates: { executionRate: 100, recoveryRate: 100 },
        activity: {
            activeDays: 6, missedDays: 1, overachievementDays: 2,
            totalEffort: 550,
            dailyEffort: {
                '2026-04-14': 80, '2026-04-15': 120, '2026-04-16': 90,
                '2026-04-17': 0, '2026-04-18': 100, '2026-04-19': 60, '2026-04-20': 100
            }
        },
        scores: { consistency: 84, intensity: 88, disciplineScore: 92 }
    };

    const data = isTourMode ? tourData : dashboardData;

    if (isLoading && !isTourMode) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#6c63ff', borderRightColor: '#00d4ff' }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Loading your sprint data...</p>
        </div>
    );

    if ((error || !data) && !isTourMode) return (
        <div style={{ padding: 40, color: 'rgba(255,100,100,0.8)', textAlign: 'center' }}>
            <RiAlertFill size={40} /><p style={{ marginTop: 12 }}>Failed to load analytics. Check your connection.</p>
        </div>
    );

    const { sprintWindow, checkpoints, rates, activity, scores } = data!;
    const verdict = getVerdict(scores.disciplineScore);
    const totalCompleted = checkpoints.earlyCompleted.count + checkpoints.onTimeCompleted.count + checkpoints.recovered.count;

    return (
        <div id="tour-dashboard" style={{ padding: isMobile ? '12px 16px' : '24px 28px', maxWidth: 1280, margin: '0 auto' }}>

            {/* ── Header ── */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: isMobile ? '1.2rem' : '1.6rem', fontWeight: 800, margin: 0, background: 'linear-gradient(90deg, #fff, rgba(255,255,255,0.6))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Weekly Performance Dashboard
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.35)', margin: '4px 0 0', fontSize: '0.82rem' }}>
                        Sprint · {fmt(sprintWindow.start)} – {fmt(sprintWindow.end)}
                    </p>
                </div>

                <select
                    value={selectedSprint}
                    onChange={e => setSelectedSprint(e.target.value)}
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white', padding: '8px 12px', borderRadius: 8,
                        outline: 'none', cursor: 'pointer', fontSize: '0.9rem'
                    }}
                >
                    <option value="current" style={{ color: 'black' }}>Current Sprint</option>
                    {sprints.map((s: any) => (
                        <option key={s.id} value={s.weekStart.slice(0, 10)} style={{ color: 'black' }}>
                            {fmt(s.weekStart.slice(0, 10))} – {fmt(s.weekEnd.slice(0, 10))}
                        </option>
                    ))}
                </select>
            </motion.div>

            {/* ── Main grid ── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 280px',
                gap: 20,
                alignItems: 'start'
            }}>

                {/* LEFT COLUMN */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Verdict banner */}
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
                        <div style={{
                            position: 'relative', overflow: 'hidden', borderRadius: 18,
                            background: 'linear-gradient(135deg, rgba(108,99,255,0.25), rgba(0,212,255,0.1))',
                            border: '1px solid rgba(108,99,255,0.4)', padding: '20px 24px',
                        }}>
                            {/* Floating glow orbs */}
                            <div style={{ position: 'absolute', top: -40, right: 80, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, ${verdict.color}30, transparent 70%)`, pointerEvents: 'none' }} />
                            <div style={{ position: 'absolute', bottom: -30, right: 40, width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle, #00d4ff20, transparent 70%)', pointerEvents: 'none' }} />

                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
                                <motion.div animate={{ rotate: [0, 10, -8, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                                    style={{ fontSize: '2.8rem', filter: 'drop-shadow(0 0 12px rgba(255,200,0,0.6))' }}>
                                    🏆
                                </motion.div>
                                <div>
                                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, letterSpacing: 1.5, textTransform: 'uppercase' }}>Weekly Verdict</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'white' }}>{verdict.label},</span>
                                        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: verdict.color, textShadow: `0 0 20px ${verdict.color}` }}>
                                            {verdict.sub}
                                        </span>
                                    </div>
                                    <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                        {activity.overachievementDays > 0
                                            ? `You exceeded your effort target on ${activity.overachievementDays} day${activity.overachievementDays > 1 ? 's' : ''}.`
                                            : 'Push to overachieve your effort targets this week.'}
                                        {checkpoints.recovered.count > 0 ? ` Recovered ${checkpoints.recovered.count} missed checkpoint${checkpoints.recovered.count > 1 ? 's' : ''}.` : ''}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Weekly Effort Chart */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
                        <GlassCard>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <SectionTitle>Weekly Effort Overview</SectionTitle>
                                <div style={{ display: 'flex', gap: 16, fontSize: '0.62rem' }}>
                                    {[['#00ff9d', 'Overachieved'], ['#6c63ff', 'Achieved'], ['#ff6b35', 'Low']].map(([c, l]) => (
                                        <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.45)' }}>
                                            <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <EffortChart dailyEffort={activity.dailyEffort} overachievementDays={activity.overachievementDays} />
                        </GlassCard>
                    </motion.div>

                    {/* Checkpoint tiles */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
                        <GlassCard>
                            <SectionTitle>Checkpoint Breakdown</SectionTitle>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                                gap: 12
                            }}>
                                <CpTile label="Planned" count={checkpoints.planned.count} icon={<RiCalendarCheckFill />} color="#8888aa" sub="this sprint" />
                                <CpTile label="Completed" count={totalCompleted} icon={<RiCheckboxCircleFill />} color="#00d4ff"
                                    sub={`${checkpoints.planned.count > 0 ? Math.round(totalCompleted / checkpoints.planned.count * 100) : 0}%`} />
                                <CpTile label="Recovered" count={checkpoints.recovered.count} icon={<RiFlashlightFill />} color="#ffd700" sub="late → done" />
                                <CpTile label="Overdue" count={checkpoints.overduePending.count} icon={<RiAlertFill />} color="#ff4d6d" sub="still pending" />
                            </div>

                            {/* Sub breakdown */}
                            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                                {[
                                    { label: 'Early', count: checkpoints.earlyCompleted.count, color: '#00ff9d' },
                                    { label: 'On Time', count: checkpoints.onTimeCompleted.count, color: '#00d4ff' },
                                    { label: 'Recovered', count: checkpoints.recovered.count, color: '#ffd700' },
                                ].map(({ label, count, color }) => (
                                    <motion.div key={label} whileHover={{ scale: 1.06 }}
                                        style={{ flex: 1, background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{count}</div>
                                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{label}</div>
                                    </motion.div>
                                ))}
                            </div>
                        </GlassCard>
                    </motion.div>

                    {/* Score row */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                            gap: 12
                        }}>
                            <ScorePill label="Consistency" value={scores.consistency} color="#6c63ff" icon={<RiCalendarCheckFill />} />
                            <ScorePill label="Intensity" value={scores.intensity} color="#00d4ff" icon={<RiFlashlightFill />} />
                            <ScorePill label="Execution" value={rates.executionRate} color="#00ff9d" icon={<RiTrophyFill />} />
                        </div>
                    </motion.div>
                </div>

                {/* RIGHT COLUMN — on mobile rendered below the left column naturally */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Discipline gauge */}
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.15 }}>
                        <GlassCard style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 28 }}>
                            <HoloGauge value={scores.disciplineScore} />
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
                                style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#00ff9d', fontSize: '0.78rem', fontWeight: 700 }}>
                                <RiArrowUpLine /> <span>+{Math.max(0, scores.disciplineScore - 70)} vs avg</span>
                            </motion.div>
                        </GlassCard>
                    </motion.div>

                    {/* Planned vs Completed */}
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.25 }}>
                        <GlassCard>
                            <SectionTitle>Planned vs Completed</SectionTitle>
                            <div style={{ textAlign: 'center', marginBottom: 14 }}>
                                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>{totalCompleted}</span>
                                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem' }}>/{checkpoints.planned.count}</span>
                                <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#00d4ff' }}>Completed</span>
                            </div>
                            {/* Progress bar */}
                            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 14, overflow: 'hidden' }}>
                                <motion.div initial={{ width: 0 }}
                                    animate={{ width: `${checkpoints.planned.count > 0 ? (totalCompleted / checkpoints.planned.count) * 100 : 0}%` }}
                                    transition={{ duration: 1.2, ease: 'easeOut' }}
                                    style={{ height: '100%', background: 'linear-gradient(90deg, #6c63ff, #00d4ff)', borderRadius: 3, boxShadow: '0 0 10px #6c63ff' }} />
                            </div>

                            <RatePill label="Execution Rate" value={rates.executionRate} color="#00d4ff" />
                            <RatePill label="Recovery Rate" value={rates.recoveryRate} color="#ffd700" />
                        </GlassCard>
                    </motion.div>

                    {/* Daily effort mini */}
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.35 }}>
                        <GlassCard>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <SectionTitle>Daily Effort</SectionTitle>
                                <span style={{ fontSize: '0.72rem', color: '#6c63ff', fontWeight: 700 }}>Total: {activity.totalEffort} pts</span>
                            </div>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 72 }}>
                                {Object.entries(activity.dailyEffort).map(([date, val], i) => {
                                    const maxE = Math.max(...Object.values(activity.dailyEffort), 1);
                                    const bodyH = val === 0 ? 3 : Math.max((val / maxE) * 48, 8);
                                    const CAP_M = 5; // mini cap half-height
                                    const totalH = bodyH + CAP_M * 2;
                                    const col = val === 0 ? 'rgba(255,255,255,0.07)' : val > (activity.totalEffort / 7) * 1.3 ? '#00ff9d' : '#6c63ff';
                                    const empty = val === 0;
                                    return (
                                        <motion.div key={date} initial={{ height: 0, opacity: 0 }} animate={{ height: totalH, opacity: 1 }}
                                            transition={{ duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                                            title={`${new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}: ${val} pts`}
                                            style={{ flex: 1, position: 'relative', overflow: 'visible', cursor: 'default' }}
                                        >
                                            {/* Mini top hollow ring */}
                                            <div style={{
                                                position: 'absolute', top: 0, left: '-10%', right: '-10%', height: CAP_M * 2,
                                                borderRadius: '50%',
                                                background: empty ? 'rgba(255,255,255,0.04)'
                                                    : `radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 46%, ${col}40 54%, ${col}ff 68%, ${col}55 82%, transparent 95%)`,
                                                boxShadow: empty ? 'none' : `0 0 12px ${col}cc, 0 -3px 14px ${col}70`,
                                                zIndex: 2,
                                            }} />
                                            {/* Mini body — hollow tube + gridlines */}
                                            <div style={{
                                                position: 'absolute', top: CAP_M, bottom: CAP_M, left: 0, right: 0,
                                                background: empty ? 'rgba(255,255,255,0.02)' : [
                                                    `repeating-linear-gradient(to bottom, transparent 0px, transparent 5px, ${col}28 5px, ${col}28 6px)`,
                                                    `linear-gradient(to right, ${col}ff 0%, ${col}80 5%, ${col}12 15%, ${col}06 50%, ${col}12 85%, ${col}80 95%, ${col}ff 100%)`,
                                                ].join(', '),
                                                boxShadow: empty ? 'none' : `-1px 0 8px ${col}80, 1px 0 8px ${col}80`,
                                            }} />
                                            {/* Mini bottom hollow ring */}
                                            <div style={{
                                                position: 'absolute', bottom: 0, left: '-10%', right: '-10%', height: CAP_M * 2,
                                                borderRadius: '50%',
                                                background: empty ? 'rgba(255,255,255,0.02)' : `radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 52%, ${col}28 60%, ${col}aa 72%, transparent 90%)`,
                                                boxShadow: empty ? 'none' : `0 0 8px ${col}50`,
                                                zIndex: 2,
                                            }} />
                                            {/* Mini flicker+scan */}
                                            {!empty && (
                                                <motion.div animate={{ y: [0, bodyH + CAP_M] }}
                                                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear', delay: i * 0.18 + 0.3 }}
                                                    style={{ position: 'absolute', top: CAP_M, left: '-10%', right: '-10%', height: Math.max(bodyH * 0.15, 3), background: `linear-gradient(to bottom, transparent, ${col}cc, ${col}ff, ${col}cc, transparent)`, boxShadow: `0 0 6px ${col}`, pointerEvents: 'none', filter: 'blur(0.5px)' }}
                                                />
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                                {Object.keys(activity.dailyEffort).map(date => (
                                    <span key={date} style={{ flex: 1, textAlign: 'center', fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>
                                        {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}
                                    </span>
                                ))}
                            </div>

                            {/* Activity summary */}
                            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                                {[
                                    { label: 'Active days', value: activity.activeDays, color: '#6c63ff' },
                                    { label: 'Overachieved', value: activity.overachievementDays, color: '#00ff9d' },
                                    { label: 'Missed', value: activity.missedDays, color: '#ff4d6d' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} style={{ flex: 1, textAlign: 'center', background: `${color}10`, borderRadius: 8, padding: '8px 4px' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{value}</div>
                                        <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{label}</div>
                                    </div>
                                ))}
                            </div>
                        </GlassCard>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
