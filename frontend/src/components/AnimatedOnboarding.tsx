/**
 * AnimatedOnboarding.tsx
 *
 * A full-screen, interactive "Playable Simulation" of IgniteMate.
 * Built to be pixel-perfect against the real app — same design tokens,
 * same AppShell layout (sidebar on md+, bottom nav on mobile), same
 * component styles, fully responsive.
 *
 * NO API calls — all data is hardcoded mock.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiHome5Fill, RiDashboardFill, RiMoonClearFill,
  RiCheckboxCircleFill, RiSettings4Fill,
  RiAddLine, RiTimeLine, RiFireLine, RiRoadMapLine,
  RiCheckDoubleLine, RiArrowUpLine,
  RiTrophyFill, RiFlashlightFill, RiCalendarCheckFill,
  RiNotification3Line, RiVolumeUpLine, RiMoonLine,
  RiShieldCheckLine,
} from 'react-icons/ri';

// ─── Design Tokens (mirrors variables.css) ────────────────────────────────────

const T = {
  bgPrimary: '#050510',
  bgSecondary: '#101025',
  accent: '#00f2ea',
  accentGlow: 'rgba(0,242,234,0.4)',
  gold: '#ffd700',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.7)',
  danger: '#ff4d4d',
  success: '#00e676',
  glassBg: 'rgba(16,16,37,0.6)',
  glassBorder: 'rgba(255,255,255,0.1)',
  glassBlur: 'blur(12px)',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnimatedOnboardingProps {
  onComplete: () => void;
}

interface ChatMsg {
  id: string;
  text: string;
  sender: 'USER' | 'AI';
  timestamp: number;
  readAt?: number;
}

// ─── Mock Data (mirrors MOCK_TOUR_DATA + extends for full scene coverage) ──────

const MOCK_MESSAGES_INTRO: ChatMsg[] = [
  { id: 'm1', text: 'Hi. I am your AI Mentor.', sender: 'AI', timestamp: Date.now() - 5000 },
  { id: 'm2', text: 'I am not just a chatbot. I am an engine that takes personal responsibility for your dream.', sender: 'AI', timestamp: Date.now() - 3000 },
  { id: 'm3', text: 'Tell me what you want to achieve, and I will track, guide, and push you based on your live performance.', sender: 'AI', timestamp: Date.now() - 1000 },
];

const MOCK_MESSAGES_CLIMAX: ChatMsg[] = [
  {
    id: 'c1',
    text: "Great execution today. Your discipline score is up, and your ETA just moved closer. I'll check in tomorrow. Are you ready?",
    sender: 'AI',
    timestamp: Date.now(),
  },
];


const MOCK_ROADMAP_NODES = [
  { id: 'r1', title: 'AWS Cloud Practitioner', status: 'COMPLETED', orderIndex: 0 },
  { id: 'r2', title: 'Core Services & IAM', status: 'COMPLETED', orderIndex: 1 },
  { id: 'r3', title: 'Serverless & Lambda', status: 'IN_PROGRESS', orderIndex: 2 },
  { id: 'r4', title: 'Full Stack Integration', status: 'PENDING', orderIndex: 3 },
  { id: 'r5', title: 'DynamoDB & Data Layer', status: 'REVISION_REQUIRED', orderIndex: 4 },
  { id: 'r6', title: 'DevOps & CI/CD', status: 'PENDING', orderIndex: 5 },
];

const MOCK_TASKS_INITIAL = [
  { id: 't1', title: 'Write initial Lambda function', progress: 100, dreamId: 'mock-1' },
  { id: 't2', title: 'Configure API Gateway', progress: 0, dreamId: 'mock-1' },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

const formatTime = (ts: number) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ts));

// ─── Confetti Canvas ──────────────────────────────────────────────────────────

const ConfettiCanvas: React.FC<{ trigger: boolean }> = ({ trigger }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!trigger || !ref.current) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const cols = [T.accent, T.gold, '#6c63ff', '#ff6b35', '#00ff9d', '#ff4d9f'];
    const particles = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width, y: -20,
      vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 2,
      r: Math.random() * 5 + 2, color: cols[Math.floor(Math.random() * cols.length)],
      rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 7, life: 1,
    }));
    let raf: number;
    const frame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.09; p.rot += p.rotV; p.life -= 0.007;
        if (p.life <= 0) return;
        ctx.save(); ctx.globalAlpha = p.life; ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180); ctx.fillStyle = p.color;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.8); ctx.restore();
      });
      if (particles.some(p => p.life > 0)) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [trigger]);
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9998 }} />;
};

// ─── Real MessageBubble (mirrors HomePage.tsx exactly) ────────────────────────

const MessageBubble: React.FC<{ msg: ChatMsg }> = ({ msg }) => {
  const isUser = msg.sender === 'USER';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}
    >
      <div style={{
        maxWidth: '80%', padding: '10px 14px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? T.accent : T.glassBg,
        backdropFilter: isUser ? undefined : T.glassBlur,
        border: isUser ? 'none' : `1px solid ${T.glassBorder}`,
        color: isUser ? T.bgPrimary : T.textPrimary,
        fontSize: '0.92rem', lineHeight: 1.5,
        fontFamily: 'var(--font-body)', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
        boxShadow: isUser ? 'none' : '0 2px 14px rgba(0,0,0,0.15)',
      }}>
        {msg.text}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, paddingLeft: 4, paddingRight: 4 }}>
        <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
          {formatTime(msg.timestamp)}
        </span>
        {isUser && (
          <span style={{ color: msg.readAt ? T.accent : 'rgba(255,255,255,0.3)', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '-2px' }}>
            {msg.readAt ? '✓✓' : '✓'}
          </span>
        )}
      </div>
    </motion.div>
  );
};

// ─── Real TypingIndicator (mirrors HomePage.tsx exactly) ──────────────────────

const LOADING_PHRASES = ['Coach is thinking...', 'Reviewing your goals...', 'Forging the path...', 'Calculating impact...'];

const TypingIndicator: React.FC = () => {
  const [phraseIdx, setPhraseIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhraseIdx(i => (i + 1) % LOADING_PHRASES.length), 2400);
    return () => clearInterval(id);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, marginBottom: 12 }}
    >
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center',
        background: T.glassBg, backdropFilter: T.glassBlur,
        border: `1px solid ${T.glassBorder}`, padding: '10px 14px', borderRadius: '18px 18px 18px 4px',
      }}>
        {[0, 1, 2].map(i => (
          <motion.span key={i}
            style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, display: 'block' }}
            animate={{ y: ['0%', '-55%', '0%'], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.14 }}
          />
        ))}
      </div>
      <div style={{ height: 16, overflow: 'hidden' }}>
        <AnimatePresence mode="popLayout">
          <motion.span key={phraseIdx}
            initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}
            transition={{ duration: 0.28 }}
            style={{ fontSize: '0.68rem', color: T.accent, opacity: 0.8, display: 'block', letterSpacing: '0.5px' }}
          >
            {LOADING_PHRASES[phraseIdx]}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ─── Real Chat Input (mirrors HomePage.tsx exactly) ───────────────────────────

const ChatInputBar: React.FC<{ disabled?: boolean; placeholder?: string }> = ({ disabled, placeholder = 'Ask something...' }) => {
  const [val, setVal] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 150)}px`;
  }, [val]);
  return (
    <div style={{ flexShrink: 0, paddingTop: 12, borderTop: `1px solid ${T.glassBorder}` }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 10,
        background: T.glassBg, backdropFilter: T.glassBlur,
        border: `1px solid ${T.glassBorder}`, borderRadius: 20, padding: '10px 14px',
      }}>
        <textarea ref={ref} value={val} onChange={e => setVal(e.target.value)}
          disabled={disabled} placeholder={placeholder} rows={1}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', color: T.textPrimary, fontFamily: 'var(--font-body)',
            fontSize: '0.93rem', lineHeight: 1.5, maxHeight: 150, overflowY: 'auto',
            opacity: disabled ? 0.5 : 1,
          }}
        />
        <motion.button
          whileHover={val.trim() && !disabled ? { scale: 1.08 } : {}}
          whileTap={val.trim() && !disabled ? { scale: 0.92 } : {}}
          disabled={disabled || !val.trim()}
          style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: 'none',
            cursor: val.trim() && !disabled ? 'pointer' : 'default',
            background: val.trim() && !disabled ? T.accent : 'rgba(255,255,255,0.08)',
            color: val.trim() && !disabled ? T.bgPrimary : 'rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.2s, color 0.2s',
            boxShadow: val.trim() && !disabled ? `0 0 12px ${T.accentGlow}` : 'none',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </motion.button>
      </div>
      <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 6 }}>
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
};

// ─── Real GlassCard ───────────────────────────────────────────────────────────

const GC: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }> = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{
    background: T.glassBg, backdropFilter: T.glassBlur,
    border: `1px solid ${T.glassBorder}`, borderRadius: 16,
    padding: 16, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', transition: 'all 0.3s ease',
    ...style,
  }}>
    {children}
  </div>
);

// ─── Pulsing CTA Button (the "you must click this" element) ──────────────────

const PulseCTA: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  size?: 'sm' | 'md' | 'lg';
}> = ({ onClick, children, style, size = 'md' }) => {
  const padding = { sm: '8px 16px', md: '12px 24px', lg: '16px 36px' }[size];
  const fontSize = { sm: '0.82rem', md: '0.9rem', lg: '1rem' }[size];
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.96 }}
      animate={{ boxShadow: [`0 0 15px ${T.accentGlow}`, `0 0 32px ${T.accentGlow}`, `0 0 15px ${T.accentGlow}`] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      // The mandatory class from spec:
      className="animate-pulse ring-4 ring-indigo-500"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding, fontFamily: 'var(--font-heading)', fontWeight: 700,
        fontSize, borderRadius: 9999, letterSpacing: '0.05em', textTransform: 'uppercase',
        background: T.accent, color: T.bgPrimary, border: 'none', cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </motion.button>
  );
};

// ─── Real AppShell Clone (sidebar md+, bottom-nav mobile) ─────────────────────

type NavTab = 'home' | 'dashboard' | 'dreams' | 'tasks' | 'settings';

const NAV_ITEMS: { id: NavTab; label: string; Icon: React.FC<any> }[] = [
  { id: 'home', label: 'Home', Icon: RiHome5Fill },
  { id: 'dashboard', label: 'Dashboard', Icon: RiDashboardFill },
  { id: 'dreams', label: 'Dreams', Icon: RiMoonClearFill },
  { id: 'tasks', label: 'Tasks', Icon: RiCheckboxCircleFill },
  { id: 'settings', label: 'Settings', Icon: RiSettings4Fill },
];

const AppShellClone: React.FC<{
  children: React.ReactNode;
  activeTab: NavTab;
}> = ({ children, activeTab }) => (
  <div style={{ display: 'flex', height: '100%', width: '100%', background: T.bgPrimary, overflow: 'hidden', borderRadius: 'inherit' }}>
    {/* ── Sidebar (md+) ── */}
    <aside style={{
      width: 280, background: T.bgSecondary, borderRight: '1px solid rgba(255,255,255,0.05)',
      display: 'none', flexDirection: 'column', padding: 24, flexShrink: 0,
    }} className="onboarding-sidebar">
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}, #00a29f)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: T.bgPrimary, fontWeight: 900, fontSize: '0.85rem' }}>IM</span>
        </div>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 700, color: T.accent, textShadow: `0 0 10px ${T.accentGlow}` }}>
          IgniteMate
        </span>
      </div>
      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = id === activeTab;
          return (
            <div key={id} style={{
              display: 'flex', alignItems: 'center', padding: '12px 16px',
              borderRadius: 16, position: 'relative', overflow: 'hidden',
              color: active ? T.accent : T.textSecondary,
              background: active ? `rgba(0,242,234,0.05)` : 'transparent',
              cursor: 'default',
            }}>
              {active && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: T.accent, boxShadow: `0 0 10px ${T.accent}` }} />}
              <Icon style={{ fontSize: '1.5rem', marginRight: 16 }} />
              <span style={{ fontSize: '1rem', fontWeight: 500 }}>{label}</span>
            </div>
          );
        })}
      </nav>
    </aside>

    {/* ── Main content ── */}
    <main style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 80, position: 'relative', WebkitOverflowScrolling: 'touch' }}
      className="onboarding-main">
      {children}
    </main>

    {/* ── Bottom nav (mobile) ── */}
    <nav style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 64,
      background: 'rgba(16,16,37,0.9)', backdropFilter: 'blur(10px)',
      borderTop: '1px solid rgba(255,255,255,0.05)',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 10,
    }} className="onboarding-bottom-nav">
      {NAV_ITEMS.map(({ id, label, Icon }) => {
        const active = id === activeTab;
        return (
          <div key={id} style={{
            background: 'transparent', color: active ? T.accent : T.textSecondary,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            position: 'relative', padding: 8, cursor: 'default', gap: 2,
          }}>
            <Icon style={{ fontSize: '1.5rem' }} />
            <span style={{ fontSize: '0.6rem', fontWeight: active ? 700 : 400 }}>{label}</span>
            {active && <motion.div layoutId="onboarding-nav-dot" style={{ position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: '50%', background: T.accent, boxShadow: `0 0 8px ${T.accent}` }} />}
          </div>
        );
      })}
    </nav>
  </div>
);

// ─── Scene Transition Wrapper ─────────────────────────────────────────────────

const SceneWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.38, ease: 'easeInOut' }}
    style={{ width: '100%', height: '100%' }}
  >
    {children}
  </motion.div>
);

// ─── Spotlight Overlay (highlights a region) ──────────────────────────────────

const Spotlight: React.FC<{
  children: React.ReactNode; // the highlighted content
  popover: React.ReactNode;  // the annotation bubble
  active?: boolean;
}> = ({ children, popover, active = true }) => (
  <div style={{ position: 'relative' }}>
    {active && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'absolute', inset: -4, borderRadius: 18, zIndex: 1, pointerEvents: 'none',
          boxShadow: `0 0 0 2px ${T.accent}, 0 0 20px ${T.accentGlow}`,
        }}
      />
    )}
    {children}
    {active && (
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.2 }}
        style={{
          position: 'relative', zIndex: 20, marginTop: 8,
          background: T.bgSecondary, border: `1px solid ${T.accent}40`,
          borderRadius: 12, padding: '10px 14px',
          boxShadow: `0 4px 20px rgba(0,0,0,0.4)`,
        }}
      >
        {popover}
      </motion.div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 1 — Mentor's Introduction (Chat UI)
// ─────────────────────────────────────────────────────────────────────────────

const Scene1: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [visible, setVisible] = useState<ChatMsg[]>([]);
  const [showCta, setShowCta] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const delays = [600, 2200, 4000];
    const timers = MOCK_MESSAGES_INTRO.map((msg, i) =>
      setTimeout(() => setVisible(prev => [...prev, msg]), delays[i])
    );
    const ctaTimer = setTimeout(() => setShowCta(true), 6000);
    return () => { timers.forEach(clearTimeout); clearTimeout(ctaTimer); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [visible]);

  return (
    <SceneWrap>
      {/* Full chat UI — mirrors HomePage.tsx */}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bgPrimary }}>
        {/* Chat header */}
        <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${T.glassBorder}` }}>
          <motion.div
            animate={{ boxShadow: [`0 0 0 2px ${T.accent}40`, `0 0 0 2px ${T.accent}`, `0 0 0 2px ${T.accent}40`] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, #00a29f)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <span style={{ color: T.bgPrimary, fontWeight: 900, fontSize: '0.9rem', fontFamily: 'var(--font-heading)' }}>IM</span>
          </motion.div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 700, color: T.textPrimary, lineHeight: 1.2, margin: 0 }}>
              The Architect
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
                style={{ width: 7, height: 7, borderRadius: '50%', background: T.success, display: 'inline-block' }} />
              <span style={{ fontSize: '0.7rem', color: T.accent, opacity: 0.85 }}>Architect Protocol Active</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', display: 'flex', flexDirection: 'column' }}>
          <AnimatePresence initial={false}>
            {visible.map(m => <MessageBubble key={m.id} msg={m} />)}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* CTA */}
        <div style={{ flexShrink: 0, padding: '16px', borderTop: `1px solid ${T.glassBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <AnimatePresence>
            {showCta && (
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <PulseCTA onClick={onNext} size="lg">
                  <RiFireLine /> Let's Build Your Dream
                </PulseCTA>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Show real chat input (disabled/decorative) */}
          {!showCta && <ChatInputBar disabled placeholder="The Architect is typing..." />}
        </div>
      </div>
    </SceneWrap>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 2 — Dream Creation (Dreams page clone)
// ─────────────────────────────────────────────────────────────────────────────

const Scene2: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <SceneWrap>
      <AppShellClone activeTab="dreams">
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: T.textPrimary, margin: 0, fontSize: '1.5rem' }}>Your Dreams</h2>
          <PulseCTA onClick={() => setShowModal(true)} size="sm">
            <RiAddLine /> New Dream
          </PulseCTA>
        </div>

        {/* Existing dream card — mirrors DreamsPage GlassCard exactly */}
        <GC style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <h3 style={{ fontSize: '1.3rem', marginBottom: 8, color: T.accent, fontFamily: 'var(--font-heading)', paddingRight: 60 }}>
            Master Spanish in 3 Months
          </h3>
          <p style={{ color: T.textSecondary, marginBottom: 16, flex: 1, fontSize: '0.9rem' }}>
            Reach B2 conversational fluency through daily immersion and structured review.
          </p>
          <div style={{ borderTop: `1px solid ${T.glassBorder}`, paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.9rem', color: T.gold }}>
              <RiFireLine /> <span>"Discipline beats motivation every single day."</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: T.textSecondary, marginBottom: 16 }}>
              <RiTimeLine /> <span>Jul 2026</span>
            </div>
            <button style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'transparent', border: `1px solid ${T.glassBorder}`, color: T.textSecondary,
              padding: '10px 16px', borderRadius: 9999, fontSize: '0.85rem', cursor: 'default',
            }}>
              <RiRoadMapLine /> View Roadmap
            </button>
          </div>
        </GC>
      </AppShellClone>

      {/* ── Dream Creation Modal ── */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, background: 'rgba(5,5,16,0.85)',
              backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16, zIndex: 200, borderRadius: 'inherit',
            }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: T.bgSecondary, border: `1px solid ${T.glassBorder}`, borderRadius: 24,
                padding: 24, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto',
              }}
            >
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: 24, fontSize: '1.2rem', color: T.textPrimary }}>
                Declare a New Dream
              </h3>

              {/* Title — prefilled */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: T.textSecondary }}>Title</label>
                <div style={{ width: '100%', padding: 12, borderRadius: 8, background: 'rgba(0,242,234,0.08)', border: `1px solid ${T.accent}50`, color: T.textPrimary, fontSize: '0.9rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Become a Full Stack AWS Engineer
                </div>
              </div>

              {/* Timeline — prefilled */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: T.textSecondary }}>Timeline</label>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(0,242,234,0.05)', border: `1px solid ${T.glassBorder}`, color: T.accent, fontSize: '0.9rem', fontFamily: 'var(--font-body)' }}>
                  6 Months → Dec 2026
                </div>
              </div>

              {/* Motivation */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: T.textSecondary }}>Motivation Statement</label>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.glassBorder}`, color: T.textPrimary, fontSize: '0.9rem', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                  David Goggins. They don't know me son.
                </div>
              </div>

              {/* Impact score */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem', color: T.textSecondary }}>
                  <span>Impact Score</span>
                  <span style={{ color: T.accent, fontWeight: 'bold' }}>10</span>
                </label>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: `linear-gradient(90deg, ${T.accent}, #00a29f)`, borderRadius: 3, boxShadow: `0 0 8px ${T.accentGlow}` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: T.textSecondary, marginTop: 4 }}>
                  <span>Nice to have</span><span>Life-changing</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: `1px solid ${T.glassBorder}`, color: T.textSecondary, padding: '10px 20px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Cancel
                </button>
                <PulseCTA onClick={onNext} size="sm">
                  Set This Dream
                </PulseCTA>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </SceneWrap>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 3 — Roadmap Tour (Visual Roadmap with spotlights)
// ─────────────────────────────────────────────────────────────────────────────

type RoadmapStep = 1 | 2 | 3 | 4;

const nodeColor = (status: string) => {
  if (status === 'COMPLETED') return '#00e676';
  if (status === 'IN_PROGRESS') return T.accent;
  if (status === 'REVISION_REQUIRED') return '#ff6b35';
  return 'rgba(255,255,255,0.15)';
};
const nodeLabel = (status: string) => {
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'IN_PROGRESS') return 'Active';
  if (status === 'REVISION_REQUIRED') return 'Revision';
  return 'Pending';
};
const nodeIcon = (status: string) => {
  if (status === 'COMPLETED') return '✓';
  if (status === 'IN_PROGRESS') return '●';
  if (status === 'REVISION_REQUIRED') return '↺';
  return '○';
};

const ROADMAP_POPOVERS: Record<RoadmapStep, { title: string; body: string }> = {
  1: { title: '📅 Real-Time ETA', body: 'Watch your timeline shift based on your discipline — we recalculate it every week based on live performance.' },
  2: { title: '✅ Completed Checkpoints', body: 'These milestones are locked in. Your Mentor has logged and verified your performance here.' },
  3: { title: '⚡ Your Active Focus Area', body: 'This is where you should be right now. Your daily tasks feed directly into this node.' },
  4: { title: '🔄 Smart Revision Loop', body: 'Failed assessments are pushed here automatically — no permanently falling behind.' },
};

const Scene3: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [step, setStep] = useState<RoadmapStep>(1);
  const popover = ROADMAP_POPOVERS[step];
  const isLast = step === 4;

  const isHighlighted = (node: typeof MOCK_ROADMAP_NODES[0]) => {
    if (step === 2) return node.status === 'COMPLETED';
    if (step === 3) return node.status === 'IN_PROGRESS';
    if (step === 4) return node.status === 'REVISION_REQUIRED';
    return false;
  };

  return (
    <SceneWrap>
      <AppShellClone activeTab="dreams">
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: T.textPrimary, margin: 0 }}>
            AetherFlow Roadmap
          </h2>
          <p style={{ color: T.textSecondary, margin: '4px 0 0', fontSize: '0.85rem' }}>
            Your physical workspace. Pinned, threaded, illuminated.
          </p>
        </div>

        {/* ETA bar */}
        <Spotlight
          active={step === 1}
          popover={
            <div>
              <div style={{ fontWeight: 700, color: T.textPrimary, fontSize: '0.85rem', marginBottom: 4 }}>{popover.title}</div>
              <div style={{ fontSize: '0.78rem', color: T.textSecondary, lineHeight: 1.5 }}>{popover.body}</div>
            </div>
          }
        >
          <GC style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: step === 1 ? 0 : 16 }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: T.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Real-Time ETA
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: T.textPrimary, fontFamily: 'var(--font-heading)' }}>
                Dec 2026
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: T.success, fontWeight: 700 }}>↑ On Track</div>
              <div style={{ fontSize: '0.65rem', color: T.textSecondary }}>Recalculates weekly</div>
            </div>
          </GC>
        </Spotlight>

        {step !== 1 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.72rem', color: T.textSecondary, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Milestone Map</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MOCK_ROADMAP_NODES.map((node) => {
                const hl = isHighlighted(node);
                const col = nodeColor(node.status);
                return (
                  <div key={node.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: col, boxShadow: `0 0 10px ${col}80`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#000', fontWeight: 900 }}>
                        {nodeIcon(node.status)}
                      </div>
                      <motion.div
                        animate={hl ? { scale: [1, 1.01, 1] } : {}}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        style={{
                          flex: 1, padding: '11px 14px', borderRadius: 12,
                          background: hl ? `${col}20` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${hl ? col : T.glassBorder}`,
                          boxShadow: hl ? `0 0 16px ${col}40` : 'none',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          transition: 'all 0.4s ease',
                        }}
                      >
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: T.textPrimary }}>{node.title}</span>
                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 6, background: `${col}25`, color: col, fontWeight: 700 }}>
                          {nodeLabel(node.status)}
                        </span>
                      </motion.div>
                    </div>
                    {/* Spotlight popover attached directly under the highlighted node */}
                    {hl && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.3 }}
                        style={{ marginLeft: 30, marginTop: 6, background: T.bgSecondary, border: `1px solid ${col}40`, borderRadius: 12, padding: '10px 14px' }}
                      >
                        <div style={{ fontWeight: 700, color: T.textPrimary, fontSize: '0.82rem', marginBottom: 3 }}>{popover.title}</div>
                        <div style={{ fontSize: '0.76rem', color: T.textSecondary, lineHeight: 1.5 }}>{popover.body}</div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, padding: '0 4px' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {([1, 2, 3, 4] as RoadmapStep[]).map(s => (
              <div key={s} style={{ width: s === step ? 20 : 6, height: 6, borderRadius: 3, background: s === step ? T.accent : 'rgba(255,255,255,0.15)', transition: 'all 0.3s' }} />
            ))}
          </div>
          <PulseCTA
            onClick={() => { if (isLast) onNext(); else setStep(s => (s + 1) as RoadmapStep); }}
            size="sm"
          >
            {isLast ? <><RiFlashlightFill /> Let's Execute</> : 'Next →'}
          </PulseCTA>
        </div>
      </AppShellClone>
    </SceneWrap>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 4 — Task Creation & Execution (Mission Log clone)
// ─────────────────────────────────────────────────────────────────────────────

type TaskPhase = 'idle' | 'modal' | 'list' | 'done';

const Scene4: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [phase, setPhase] = useState<TaskPhase>('idle');
  const [confetti, setConfetti] = useState(false);

  const handleMarkProgress = () => {
    setConfetti(true);
    setPhase('done');
    setTimeout(() => onNext(), 1400);
  };

  return (
    <SceneWrap>
      <ConfettiCanvas trigger={confetti} />
      <AppShellClone activeTab="tasks">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: T.textPrimary, margin: 0 }}>Mission Log</h2>
          {phase === 'idle' && (
            <PulseCTA onClick={() => setPhase('modal')} size="sm">
              <RiAddLine /> New Mission
            </PulseCTA>
          )}
        </div>

        {/* Status tabs — mirrors TasksPage */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: `1px solid rgba(255,255,255,0.1)`, paddingBottom: 16 }}>
          {['PENDING', 'IN PROGRESS', 'COMPLETED'].map((s, i) => (
            <button key={s} style={{ background: 'transparent', border: 'none', color: i === 0 ? T.accent : T.textSecondary, fontWeight: i === 0 ? 600 : 400, fontSize: '0.9rem', cursor: 'default', padding: '4px 8px', position: 'relative' }}>
              {s}
              {i === 0 && <div style={{ position: 'absolute', bottom: -17, left: 0, right: 0, height: 2, background: T.accent }} />}
            </button>
          ))}
        </div>

        {/* Task group header */}
        <h3 style={{ fontSize: '1rem', color: T.textSecondary, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, background: T.gold, borderRadius: '50%', display: 'inline-block' }} />
          Become a Full Stack AWS Engineer
        </h3>

        {/* Existing tasks (from mock) */}
        <div style={{ display: 'grid', gap: 12 }}>
          {MOCK_TASKS_INITIAL.map(t => (
            <GC key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14 }}>
              <div>
                {t.progress === 100
                  ? <RiCheckDoubleLine color={T.success} style={{ fontSize: '1.1rem' }} />
                  : <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${T.textSecondary}` }} />}
              </div>
              <div>
                <div style={{ fontWeight: 500, color: t.progress === 100 ? T.textSecondary : T.textPrimary, textDecoration: t.progress === 100 ? 'line-through' : 'none' }}>
                  {t.title}
                </div>
              </div>
            </GC>
          ))}

          {/* Newly created task */}
          {(phase === 'list' || phase === 'done') && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <GC style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, background: 'rgba(0,242,234,0.06)', border: `1px solid ${T.accent}40` }}>
                <div>
                  {phase === 'done'
                    ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><RiCheckDoubleLine color={T.success} style={{ fontSize: '1.2rem' }} /></motion.div>
                    : <PulseCTA onClick={handleMarkProgress} size="sm"><RiCheckboxCircleFill /> Mark Progress</PulseCTA>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: T.textPrimary }}>Complete AWS Lambda Module</div>
                  <div style={{ fontSize: '0.75rem', color: T.textSecondary }}>Daily Goal 1 · Serverless & Lambda</div>
                </div>
              </GC>
              {phase === 'done' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                  style={{ marginTop: 8, padding: '8px 14px', background: `${T.success}15`, border: `1px solid ${T.success}30`, borderRadius: 10, fontSize: '0.8rem', color: T.success, fontWeight: 700 }}>
                  🎉 Discipline +2 · ETA moved 3 days closer!
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      </AppShellClone>

      {/* Task creation modal */}
      <AnimatePresence>
        {phase === 'modal' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,16,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 200, borderRadius: 'inherit' }}
            onClick={() => setPhase('idle')}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ background: T.bgSecondary, border: `1px solid ${T.glassBorder}`, borderRadius: 24, padding: 24, width: '100%', maxWidth: 440 }}
            >
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: 24, fontSize: '1.15rem', color: T.textPrimary }}>New Mission</h3>

              {/* Dream context select */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: T.textSecondary }}>Dream Context</label>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(0,242,234,0.07)', border: `1px solid ${T.accent}40`, color: T.accent, fontSize: '0.9rem', fontFamily: 'var(--font-body)' }}>
                  Become a Full Stack AWS Engineer
                </div>
              </div>

              {/* Task title — prefilled */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: T.textSecondary }}>Mission Title</label>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(0,242,234,0.05)', border: `1px solid ${T.accent}40`, color: T.textPrimary, fontSize: '0.9rem', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  Complete AWS Lambda Module
                </div>
              </div>

              {/* Checkpoint hint */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.9rem', color: T.textSecondary }}>Checkpoint</label>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.glassBorder}`, color: T.textSecondary, fontSize: '0.9rem', fontFamily: 'var(--font-body)' }}>
                  Daily Goal 1
                </div>
              </div>

              {/* Popover tip — same styling as popover system */}
              <div style={{ background: `${T.accent}10`, border: `1px solid ${T.accent}30`, borderRadius: 10, padding: '10px 14px', marginBottom: 24, display: 'flex', gap: 8 }}>
                <span style={{ fontSize: '1rem' }}>🧠</span>
                <span style={{ fontSize: '0.78rem', color: T.textSecondary, lineHeight: 1.55 }}>
                  We break massive goals into daily checkpoints so the path is always clear and executable.
                </span>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={() => setPhase('idle')} style={{ background: 'transparent', border: `1px solid ${T.glassBorder}`, color: T.textSecondary, padding: '10px 20px', borderRadius: 9999, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Cancel
                </button>
                <PulseCTA onClick={() => setPhase('list')} size="sm">Save Task</PulseCTA>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </SceneWrap>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 5 — Deep Vitals Dashboard
// ─────────────────────────────────────────────────────────────────────────────

const CircleRing: React.FC<{ value: number; color: string; label: string; size?: number; animated: boolean }> = ({ value, color, label, size = 90, animated }) => {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <defs>
            <filter id={`glow-${label}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`${color}20`} strokeWidth={7} />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={animated ? { strokeDashoffset: circ - (value / 100) * circ } : {}}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            filter={`url(#glow-${label})`}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 900, color, fontFamily: 'var(--font-heading)' }}>
          {value}%
        </div>
      </div>
      <div style={{ fontSize: '0.68rem', color: T.textSecondary, textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
};

const Scene5: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 300); return () => clearTimeout(t); }, []);

  const barData = [{ v: 80, d: 'M' }, { v: 120, d: 'T' }, { v: 90, d: 'W' }, { v: 0, d: 'T' }, { v: 100, d: 'F' }, { v: 60, d: 'S' }, { v: 100, d: 'S' }];
  const maxBar = Math.max(...barData.map(b => b.v), 1);
  const barColor = (v: number) => v === 0 ? 'rgba(255,255,255,0.08)' : v >= 100 ? '#00ff9d' : v >= 70 ? '#6c63ff' : '#ff6b35';

  return (
    <SceneWrap>
      <AppShellClone activeTab="dashboard">
        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.4rem', color: T.textPrimary, margin: 0 }}>
            Weekly Performance Dashboard
          </h2>
          <p style={{ color: T.textSecondary, margin: '4px 0 0', fontSize: '0.8rem' }}>
            Sprint · Apr 14 – Apr 20
          </p>
        </motion.div>

        {/* Verdict banner — mirrors DashboardPage exactly */}
        <GC style={{ position: 'relative', overflow: 'hidden', marginBottom: 16, background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(0,212,255,0.06))', border: '1px solid rgba(108,99,255,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <motion.div animate={{ rotate: [0, 10, -8, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              style={{ fontSize: '2rem', filter: 'drop-shadow(0 0 10px rgba(255,200,0,0.5))' }}>🏆</motion.div>
            <div>
              <div style={{ fontSize: '0.65rem', color: T.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>Weekly Verdict</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: T.textPrimary }}>Outstanding Week, <span style={{ color: '#ff6b35', textShadow: '0 0 16px #ff6b3580' }}>You're on Fire! 🔥</span></div>
              <p style={{ fontSize: '0.78rem', color: T.textSecondary, margin: '4px 0 0' }}>You exceeded your effort target on 2 days. Recovered 2 missed checkpoints.</p>
            </div>
          </div>
        </GC>

        {/* Discipline gauge + charts in responsive grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 16 }}>
          {/* Discipline score */}
          <GC style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20 }}>
            <div style={{ fontSize: '0.7rem', color: T.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Discipline Score</div>
            <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 12 }}>
              <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                <motion.circle cx="60" cy="60" r="50" fill="none" stroke="#00ff9d" strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 50}
                  initial={{ strokeDashoffset: 2 * Math.PI * 50 }}
                  animate={animated ? { strokeDashoffset: (1 - 0.92) * 2 * Math.PI * 50 } : {}}
                  transition={{ duration: 1.4, ease: 'easeOut' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 2, repeat: Infinity }}
                  style={{ fontSize: '2rem', fontWeight: 900, color: '#00ff9d', lineHeight: 1 }}>92</motion.div>
                <div style={{ fontSize: '0.55rem', color: T.textSecondary, letterSpacing: 1.5, marginTop: 2 }}>DISCIPLINE</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#00ff9d', fontSize: '0.78rem', fontWeight: 700 }}>
              <RiArrowUpLine /> <span>+22 vs avg</span>
            </div>
          </GC>

          {/* Rates */}
          <GC>
            <div style={{ fontSize: '0.7rem', color: T.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Performance Rings</div>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <CircleRing value={92} color="#6c63ff" label="Consistency" size={80} animated={animated} />
              <CircleRing value={88} color={T.accent} label="Intensity" size={80} animated={animated} />
              <CircleRing value={100} color="#00ff9d" label="Execution" size={80} animated={animated} />
            </div>
          </GC>
        </div>

        {/* Effort bar chart — mirrors DashboardPage mini chart */}
        <GC style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: '0.7rem', color: T.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Weekly Effort</div>
            <div style={{ display: 'flex', gap: 10, fontSize: '0.62rem' }}>
              {[['#00ff9d', 'Overachieved'], ['#6c63ff', 'Achieved'], ['#ff6b35', 'Low']].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, color: T.textSecondary }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
            {barData.map((b, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={animated ? { height: `${(b.v / maxBar) * 60}px` } : {}}
                  transition={{ duration: 0.75, delay: i * 0.08, ease: 'easeOut' }}
                  style={{ width: '100%', borderRadius: '4px 4px 0 0', background: barColor(b.v), boxShadow: `0 0 8px ${barColor(b.v)}60` }}
                />
                <span style={{ fontSize: '0.6rem', color: T.textSecondary }}>{b.d}</span>
              </div>
            ))}
          </div>
        </GC>

        {/* Score pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Consistency', value: 92, color: '#6c63ff', Icon: RiCalendarCheckFill },
            { label: 'Intensity', value: 88, color: T.accent, Icon: RiFlashlightFill },
            { label: 'Execution', value: 100, color: '#00ff9d', Icon: RiTrophyFill },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon style={{ color, fontSize: '1.2rem' }} />
              <div>
                <div style={{ fontSize: '0.62rem', color: T.textSecondary, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}<span style={{ fontSize: '0.65rem', fontWeight: 400, color: T.textSecondary, marginLeft: 2 }}>/100</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* AI popover hint */}
        <div style={{ background: `${T.accent}0d`, border: `1px solid ${T.accent}25`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🤖</span>
          <span style={{ fontSize: '0.8rem', color: T.textSecondary, lineHeight: 1.55 }}>
            Your actions automatically populate your Deep Vitals, allowing your Mentor to analyze your performance and adapt your roadmap in real time.
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PulseCTA onClick={onNext} size="md">
            Next: Mentor Check-In →
          </PulseCTA>
        </div>
      </AppShellClone>
    </SceneWrap>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 6 — The Climax (Mentor Returns)
// ─────────────────────────────────────────────────────────────────────────────

const Scene6: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [showTyping, setShowTyping] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [showCta, setShowCta] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setShowTyping(false);
      setMessages(MOCK_MESSAGES_CLIMAX);
    }, 2500);
    const t2 = setTimeout(() => setShowCta(true), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, showTyping]);

  return (
    <SceneWrap>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bgPrimary }}>
        {/* Chat header — identical to scene 1 */}
        <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${T.glassBorder}` }}>
          <motion.div
            animate={{ boxShadow: [`0 0 0 2px ${T.accent}40`, `0 0 0 2px ${T.accent}`, `0 0 0 2px ${T.accent}40`] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{ width: 40, height: 40, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}, #00a29f)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <span style={{ color: T.bgPrimary, fontWeight: 900, fontSize: '0.9rem', fontFamily: 'var(--font-heading)' }}>IM</span>
          </motion.div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 700, color: T.textPrimary, lineHeight: 1.2, margin: 0 }}>The Architect</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
                style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, display: 'inline-block' }} />
              <span style={{ fontSize: '0.7rem', color: T.accent, opacity: 0.85 }}>Returning with your analysis…</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column' }}>
          <AnimatePresence>
            {showTyping && <TypingIndicator key="typing" />}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
          </AnimatePresence>

          {/* Inline stat cards after message */}
          {messages.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                { icon: '📈', label: 'Discipline', value: '+7 pts', color: '#6c63ff' },
                { icon: '📅', label: 'ETA', value: '3 days closer', color: '#00ff9d' },
                { icon: '🔥', label: 'Streak', value: '6 days', color: T.gold },
              ].map(s => (
                <div key={s.label} style={{ background: `${s.color}15`, border: `1px solid ${s.color}30`, borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.62rem', color: T.textSecondary }}>{s.label}</div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Glowing CTA */}
        <div style={{ flexShrink: 0, padding: '20px 16px', borderTop: `1px solid ${T.glassBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <AnimatePresence>
            {showCta && (
              <motion.div initial={{ opacity: 0, y: 16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5 }}
                style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <motion.button
                  onClick={onComplete}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  animate={{ boxShadow: [`0 0 20px ${T.accentGlow}`, `0 0 45px ${T.accentGlow}`, `0 0 20px ${T.accentGlow}`] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="animate-pulse ring-4 ring-indigo-500"
                  style={{
                    width: '100%', maxWidth: 360, padding: '18px 32px', borderRadius: 9999,
                    background: T.accent, border: 'none', color: T.bgPrimary,
                    fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: '1rem',
                    letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  }}
                >
                  🚀 Start My Real Journey
                </motion.button>
                <p style={{ fontSize: '0.68rem', color: T.textSecondary, margin: 0, opacity: 0.6 }}>
                  Your personalized roadmap is ready
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {!showCta && <ChatInputBar disabled placeholder="The Architect is thinking…" />}
        </div>
      </div>
    </SceneWrap>
  );
};

// ─── Scene Progress Stepper ───────────────────────────────────────────────────

const SCENE_LABELS = ['Mentor', 'Dream', 'Roadmap', 'Tasks', 'Vitals', 'Journey', 'Setup'];

const Stepper: React.FC<{ scene: number }> = ({ scene }) => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: 'rgba(5,5,16,0.7)', borderBottom: `1px solid ${T.glassBorder}`, flexShrink: 0, gap: 0, overflowX: 'auto' }}>
    {SCENE_LABELS.map((label, i) => {
      const s = i + 1;
      const done = scene > s;
      const active = scene === s;
      return (
        <React.Fragment key={s}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <motion.div
              animate={active ? { scale: [1, 1.15, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: done ? T.success : active ? T.accent : 'rgba(255,255,255,0.07)',
                border: active ? `2px solid ${T.accent}` : '2px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 900,
                color: done || active ? T.bgPrimary : 'rgba(255,255,255,0.2)',
                boxShadow: active ? `0 0 14px ${T.accentGlow}` : 'none',
                transition: 'all 0.4s ease',
              }}
            >
              {done ? '✓' : s}
            </motion.div>
            <span style={{ fontSize: '0.52rem', color: active ? T.accent : done ? T.success : 'rgba(255,255,255,0.2)', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </div>
          {i < SCENE_LABELS.length - 1 && (
            <div style={{ height: 2, flex: 1, minWidth: 8, background: done ? `linear-gradient(90deg, ${T.success}, ${T.accent})` : 'rgba(255,255,255,0.05)', borderRadius: 2, marginBottom: 14, transition: 'background 0.6s ease' }} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SCENE 7 — System Configuration (Settings page clone)
// ─────────────────────────────────────────────────────────────────────────────

type ToneType = 'NEUTRAL' | 'LOGICAL' | 'HARSH' | 'POSITIVE' | 'OPTIMISTIC' | 'FEAR';

const TONE_META: Record<ToneType, { emoji: string; label: string; desc: string; color: string }> = {
  NEUTRAL: { emoji: '⚖️', label: 'Neutral', desc: 'Balanced, fact-driven responses. No emotional pressure.', color: T.textSecondary },
  LOGICAL: { emoji: '🧠', label: 'Logical', desc: 'Pure data and reasoning. Systems-thinking mentality.', color: '#00d4ff' },
  HARSH: { emoji: '🔥', label: 'Harsh', desc: 'No excuses. Hard truths. Goggins-level accountability.', color: T.danger },
  POSITIVE: { emoji: '💪', label: 'Positive', desc: 'Encouraging, uplifting. Celebrates every small win.', color: T.success },
  OPTIMISTIC: { emoji: '🌟', label: 'Optimistic', desc: 'Glass half-full. Always sees the path forward.', color: T.gold },
  FEAR: { emoji: '⚡', label: 'Fear', desc: 'Uses consequence framing. "What if you fail?" energy.', color: '#ff6b35' },
};

const Scene7: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [tone, setTone] = useState<ToneType>('NEUTRAL');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [freq, setFreq] = useState(60);
  const [saved, setSaved] = useState(false);

  const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
    <div onClick={() => onChange(!checked)}
      style={{
        width: 48, height: 24, borderRadius: 12,
        background: checked ? T.accent : 'rgba(255,255,255,0.1)',
        position: 'relative', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0,
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: 'white',
        position: 'absolute', top: 2, left: checked ? 26 : 2, transition: 'left 0.3s',
        boxShadow: checked ? `0 0 8px ${T.accentGlow}` : 'none',
      }} />
    </div>
  );

  const handleFinish = () => {
    setSaved(true);
    setTimeout(() => onComplete(), 900);
  };

  return (
    <SceneWrap>
      <AppShellClone activeTab="settings">
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: T.textPrimary, margin: 0 }}>
            System Configuration
          </h2>
          <p style={{ color: T.textSecondary, margin: '4px 0 0', fontSize: '0.85rem' }}>
            Personalise how your Mentor talks to you and when.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>

          {/* ── Notifications card ── */}
          <GC style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <motion.div
                animate={!notifEnabled ? { scale: [1, 1.12, 1] } : {}}
                transition={{ duration: 1.4, repeat: Infinity }}
                style={{ width: 44, height: 44, borderRadius: 12, background: `${T.gold}18`, border: `1px solid ${T.gold}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <RiNotification3Line style={{ fontSize: '1.4rem', color: T.gold }} />
              </motion.div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, margin: 0, marginBottom: 3 }}>Enable Notifications</h3>
                <p style={{ fontSize: '0.8rem', color: T.textSecondary, margin: 0, lineHeight: 1.4 }}>
                  Allow your Mentor to send you real-time nudges, check-ins, and performance alerts.
                </p>
              </div>
            </div>
            <Toggle checked={notifEnabled} onChange={setNotifEnabled} />
          </GC>

          {/* Notification hint when disabled */}
          <AnimatePresence>
            {!notifEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ background: `${T.gold}0d`, border: `1px solid ${T.gold}30`, borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start', overflow: 'hidden' }}
              >
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>💡</span>
                <span style={{ fontSize: '0.78rem', color: T.textSecondary, lineHeight: 1.5 }}>
                  Without notifications, your Mentor can't reach you between sessions. Turn it on to unlock JIT (Just-in-Time) coaching pushes.
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Frequency slider — only visible when notifications on */}
          <AnimatePresence>
            {notifEnabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <GC>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${T.accent}18`, border: `1px solid ${T.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <RiMoonLine style={{ fontSize: '1.4rem', color: T.accent }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, margin: 0, marginBottom: 3 }}>Nudge Frequency</h3>
                      <p style={{ fontSize: '0.8rem', color: T.textSecondary, margin: 0 }}>How often should we check in?</p>
                    </div>
                  </div>
                  <input type="range" min={60} max={480} step={60} value={freq} onChange={e => setFreq(+e.target.value)}
                    style={{ width: '100%', accentColor: T.accent }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: '0.72rem', color: T.textSecondary }}>Every hour</span>
                    <span style={{ fontSize: '0.82rem', color: T.accent, fontWeight: 700 }}>
                      Every {freq / 60} {freq / 60 === 1 ? 'hour' : 'hours'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: T.textSecondary }}>Every 8 hrs</span>
                  </div>
                </GC>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── AI Identity card ── */}
          <GC>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${T.accent}18`, border: `1px solid ${T.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <RiVolumeUpLine style={{ fontSize: '1.4rem', color: T.accent }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, margin: 0, marginBottom: 3 }}>AI Identity &amp; Addressing</h3>
                <p style={{ fontSize: '0.8rem', color: T.textSecondary, margin: 0 }}>Personalise how the AI identifies itself and addresses you.</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Agent name */}
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem', color: T.textSecondary }}>Agent Name</label>
                <p style={{ fontSize: '0.75rem', color: `${T.textSecondary}99`, marginBottom: 8, marginTop: -4 }}>
                  Give your mentor a personality — a friend's name, a future version of yourself, or a fictional hero.
                </p>
                <input
                  type="text"
                  placeholder='e.g. "Future Jarvis", "Alex", "The Architect"'
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                  style={{
                    width: '100%', padding: 12, borderRadius: 8,
                    background: 'rgba(255,255,255,0.07)', border: `1px solid ${T.glassBorder}`,
                    color: T.textPrimary, outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                  }}
                />
              </div>

              {/* Preferred name */}
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem', color: T.textSecondary }}>How should the agent address you?</label>
                <p style={{ fontSize: '0.75rem', color: `${T.textSecondary}99`, marginBottom: 8, marginTop: -4 }}>
                  The mentor will use this name every time it speaks to you. Make it personal.
                </p>
                <input
                  type="text"
                  placeholder='e.g. "Boss", "Commander", "Tony"'
                  value={preferredName}
                  onChange={e => setPreferredName(e.target.value)}
                  style={{
                    width: '100%', padding: 12, borderRadius: 8,
                    background: 'rgba(255,255,255,0.07)', border: `1px solid ${T.glassBorder}`,
                    color: T.textPrimary, outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
                  }}
                />
              </div>
            </div>
          </GC>

          {/* ── Tone Selector ── */}
          <GC>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${T.accent}18`, border: `1px solid ${T.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <RiVolumeUpLine style={{ fontSize: '1.4rem', color: T.accent }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, margin: 0, marginBottom: 3 }}>Coach Personality</h3>
                <p style={{ fontSize: '0.8rem', color: T.textSecondary, margin: 0 }}>How should the system talk to you?</p>
              </div>
            </div>

            {/* Tone pill grid */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              {(Object.keys(TONE_META) as ToneType[]).map(t => {
                const active = tone === t;
                const meta = TONE_META[t];
                return (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    style={{
                      flex: '1 1 calc(33% - 10px)', minWidth: 90,
                      padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${active ? meta.color : T.glassBorder}`,
                      background: active ? `${meta.color}18` : 'transparent',
                      color: active ? meta.color : T.textSecondary,
                      fontFamily: 'var(--font-body)', fontWeight: active ? 700 : 400,
                      fontSize: '0.85rem', transition: 'all 0.25s ease',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{meta.emoji}</span>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Active tone description */}
            <AnimatePresence mode="wait">
              <motion.div
                key={tone}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                style={{
                  background: `${TONE_META[tone].color}12`,
                  border: `1px solid ${TONE_META[tone].color}30`,
                  borderRadius: 10, padding: '10px 14px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{TONE_META[tone].emoji}</span>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: TONE_META[tone].color, marginBottom: 2 }}>{TONE_META[tone].label}</div>
                  <div style={{ fontSize: '0.78rem', color: T.textSecondary, lineHeight: 1.5 }}>{TONE_META[tone].desc}</div>
                </div>
              </motion.div>
            </AnimatePresence>
          </GC>

          {/* ── Finish CTA ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 8 }}>
            <AnimatePresence mode="wait">
              {saved ? (
                <motion.div
                  key="saved"
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.success, fontWeight: 700, fontSize: '0.95rem' }}
                >
                  <RiShieldCheckLine style={{ fontSize: '1.2rem' }} /> Preferences saved!
                </motion.div>
              ) : (
                <motion.div key="cta">
                  <PulseCTA onClick={handleFinish} size="md">
                    🚀 Save &amp; Launch IgniteMate
                  </PulseCTA>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </AppShellClone>
    </SceneWrap>
  );
};

// ─── CSS injection for responsive sidebar/bottomnav ──────────────────────────

const ResponsiveCSS = () => (
  <style>{`
    @media (min-width: 768px) {
      .onboarding-sidebar { display: flex !important; }
      .onboarding-bottom-nav { display: none !important; }
      .onboarding-main { padding: 32px !important; padding-bottom: 32px !important; }
      .onboarding-main-wrap { max-width: 860px !important; }
    }
  `}</style>
);

// ─── Main Export ──────────────────────────────────────────────────────────────

const AnimatedOnboarding: React.FC<AnimatedOnboardingProps> = ({ onComplete }) => {
  const [scene, setScene] = useState(1);
  const go = useCallback((n: number) => setScene(n), []);

  return (
    <>
      <ResponsiveCSS />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: T.bgPrimary,
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--font-body)',
        }}
      >
        {/* Ambient glow — mirroring the app's background feel */}
        <div style={{ position: 'absolute', top: '15%', left: '-5%', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${T.accentGlow}, transparent)`, pointerEvents: 'none', filter: 'blur(60px)', opacity: 0.25 }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '-5%', width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(108,99,255,0.3), transparent)', pointerEvents: 'none', filter: 'blur(60px)', opacity: 0.2 }} />

        {/* Progress stepper */}
        <Stepper scene={scene} />

        {/* Scene viewport — uses full available space, no artificial frame */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <AnimatePresence mode="wait">
            {scene === 1 && <Scene1 key="s1" onNext={() => go(2)} />}
            {scene === 2 && <Scene2 key="s2" onNext={() => go(3)} />}
            {scene === 3 && <Scene3 key="s3" onNext={() => go(4)} />}
            {scene === 4 && <Scene4 key="s4" onNext={() => go(5)} />}
            {scene === 5 && <Scene5 key="s5" onNext={() => go(6)} />}
            {scene === 6 && <Scene6 key="s6" onComplete={() => go(7)} />}
            {scene === 7 && <Scene7 key="s7" onComplete={onComplete} />}
          </AnimatePresence>
        </div>

        {/* Skip */}
        <div style={{ flexShrink: 0, padding: '8px 16px 12px', display: 'flex', justifyContent: 'center', background: T.bgPrimary, borderTop: `1px solid ${T.glassBorder}` }}>
          <button
            onClick={onComplete}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.22)', fontSize: '0.72rem', cursor: 'pointer', padding: '5px 14px', borderRadius: 8, letterSpacing: '0.02em' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.22)')}
          >
            Skip Onboarding
          </button>
        </div>
      </motion.div>
    </>
  );
};

export default AnimatedOnboarding;
