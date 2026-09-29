import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/client';
import PageTransition from '../components/PageTransition';
import { useTour } from '../context/TourContext';
import { MOCK_TOUR_DATA } from '../utils/mockTourData';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
    id: string;
    text: string;
    sender: 'USER' | 'AI';
    timestamp: number;
    editableContent?: string;
    responseMode?: string;
    readAt?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOADING_PHRASES = [
    "Coach is thinking...",
    "Reviewing your goals...",
    "Forging the path...",
    "Calculating impact...",
    "Aligning your vision...",
];

const formatTime = (ts: number) =>
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ts));

// ── Sub-components ────────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => {
    const [phraseIdx, setPhraseIdx] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setPhraseIdx(i => (i + 1) % LOADING_PHRASES.length), 2400);
        return () => clearInterval(id);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', marginBottom: '12px' }}
        >
            <div style={{
                display: 'flex', gap: '6px', alignItems: 'center',
                background: 'var(--glass-bg)', backdropFilter: 'blur(12px)',
                border: '1px solid var(--glass-border)',
                padding: '10px 14px', borderRadius: '18px 18px 18px 4px'
            }}>
                {[0, 1, 2].map(i => (
                    <motion.span
                        key={i}
                        style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-accent)', display: 'block' }}
                        animate={{ y: ['0%', '-55%', '0%'], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.14 }}
                    />
                ))}
            </div>
            <div style={{ height: 16, overflow: 'hidden' }}>
                <AnimatePresence mode="popLayout">
                    <motion.span
                        key={phraseIdx}
                        initial={{ y: 14, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -14, opacity: 0 }}
                        transition={{ duration: 0.28 }}
                        style={{ fontSize: '0.68rem', color: 'var(--color-accent)', opacity: 0.8, display: 'block', letterSpacing: '0.5px' }}
                    >
                        {LOADING_PHRASES[phraseIdx]}
                    </motion.span>
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    const isUser = msg.sender === 'USER';
    const isSeen = msg.readAt != null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: '12px' }}
        >
            <div style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isUser
                    ? 'var(--color-accent)'
                    : 'var(--glass-bg)',
                backdropFilter: isUser ? undefined : 'blur(12px)',
                border: isUser ? 'none' : '1px solid var(--glass-border)',
                color: isUser ? '#050510' : 'var(--color-text-primary)',
                fontSize: '0.92rem', // Slightly smaller for premium feel
                lineHeight: 1.5,
                fontFamily: 'var(--font-body)',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                ...(isUser ? {} : { boxShadow: '0 2px 14px rgba(0,0,0,0.15)' })
            }}>
                {msg.text}
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: 3,
                paddingLeft: 4,
                paddingRight: 4,
            }}>
                <span style={{
                    fontSize: '0.65rem',
                    color: 'rgba(255,255,255,0.3)',
                    fontWeight: 500,
                }}>
                    {formatTime(msg.timestamp)}
                </span>
                {isUser && (
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}>
                        {isSeen ? (
                             <span style={{ color: 'var(--color-accent)', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '-2px' }}>✓✓</span>
                        ) : (
                             <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', fontWeight: 'bold' }}>✓</span>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

const TypedLoading: React.FC<{ text: string }> = ({ text }) => {
    const [dots, setDots] = useState('');
    useEffect(() => {
        const id = setInterval(() => setDots(d => (d.length >= 3 ? '' : d + '.')), 400);
        return () => clearInterval(id);
    }, []);
    return (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', opacity: 0.8, letterSpacing: '0.5px' }}>
            {text}{dots}
        </span>
    );
};

import useSWR from 'swr';

// ── Skeleton Loader ──────────────────────────────────────────────────────────

const MessageSkeleton: React.FC = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {[1, 2, 3].map(i => (
            <div key={i} style={{
                alignSelf: i % 2 === 0 ? 'flex-end' : 'flex-start',
                width: i % 2 === 0 ? '60%' : '75%',
                height: '48px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '16px',
                animation: 'pulse 1.5s infinite ease-in-out',
            }} />
        ))}
        <style>{`@keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 0.8; } 100% { opacity: 0.5; } }`}</style>
    </div>
);

// ── Main HomePage (AI Chat) ───────────────────────────────────────────────────

const HomePage: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [editableContent, setEditableContent] = useState<string | undefined>();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const topRef = useRef<HTMLDivElement>(null);
    const [agentName, setAgentName] = useState('IgniteMate');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const { isTourMode } = useTour();

    // SWR fetchers
    const { data: prefData, isLoading: prefLoading } = useSWR(
        !isTourMode ? '/users/preferences' : null,
        url => api.get(url).then(res => res.data)
    );

    const { data: historyData, isLoading: historyLoading } = useSWR(
        !isTourMode ? '/chat/history?limit=30' : null,
        url => api.get(url).then(res => res.data)
    );

    // Sync SWR data to state
    useEffect(() => {
        if (isTourMode) {
            setAgentName("The Architect");
            setMessages(MOCK_TOUR_DATA.chat.map((msg, i) => ({
                id: `mock-msg-${i}`,
                text: msg.text,
                sender: msg.sender as any,
                timestamp: msg.timestamp,
                readAt: Date.now()
            })));
            setHasMore(false);
            return;
        }

        if (prefData) {
            const userName = prefData?.user?.name || 'Architect';
            const aName = prefData?.agentName || `Future ${userName}`;
            setAgentName(aName);
        }

        if (historyData) {
            if (historyData.length > 0) {
                setMessages(historyData);
                setHasMore(historyData.length === 30);
                api.patch('/chat/seen').catch(() => {});
            } else {
                setHasMore(false);
                setMessages([{
                    id: crypto.randomUUID(),
                    text: `Hey! What are we crushing today? 🔥`,
                    sender: 'AI',
                    timestamp: Date.now(),
                }]);
            }
        }
    }, [prefData, historyData, isTourMode]);

    const initialLoading = !isTourMode && (prefLoading || (historyLoading && messages.length === 0));

    // Load older messages (Pagination)
    const loadMore = async () => {
        if (isLoadingMore || !hasMore || messages.length === 0) return;

        setIsLoadingMore(true);
        const oldestMsg = messages[0];
        const before = oldestMsg.timestamp;

        // Capture scroll height before prepending
        const container = scrollContainerRef.current;
        const previousScrollHeight = container?.scrollHeight || 0;

        try {
            const { data } = await api.get('/chat/history', { params: { limit: 30, before } });
            
            if (data && data.length > 0) {
                setMessages(prev => [...data, ...prev]);
                setHasMore(data.length === 30);

                // Scroll Recovery (WhatsApp-style anchoring)
                requestAnimationFrame(() => {
                    if (container) {
                        const newScrollHeight = container.scrollHeight;
                        container.scrollTop = newScrollHeight - previousScrollHeight;
                    }
                });
            } else {
                setHasMore(false);
            }
        } catch (err) {
            console.error("Load more failed:", err);
        } finally {
            setIsLoadingMore(false);
        }
    };

    // Auto-scroll on new messages (received while at bottom)
    useEffect(() => {
        // Only auto-scroll if it's the very first load or if a NEW message just came in at bottom
        // We handle pagination scroll recovery separately in loadMore
        if (!isLoadingMore) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages.length, isTyping]);

    // Intersection Observer for scroll-to-top
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                loadMore();
            }
        }, { threshold: 0.5 });

        if (topRef.current) observer.observe(topRef.current);
        return () => observer.disconnect();
    }, [messages, hasMore, isLoadingMore]);

    // Auto-fill input with editable content
    useEffect(() => {
        if (editableContent) {
            setInputValue(editableContent);
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    const len = textareaRef.current.value.length;
                    textareaRef.current.setSelectionRange(len, len);
                }
            }, 50);
        }
    }, [editableContent]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
    }, [inputValue]);

    const sendMessage = async () => {
        const text = inputValue.trim();
        if (!text || isTyping) return;

        const userMsg: ChatMessage = { id: crypto.randomUUID(), text, sender: 'USER', timestamp: Date.now() };
        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setEditableContent(undefined);
        setIsTyping(true);

        try {
            const { data } = await api.post('/chat', { message: text });

            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                text: data.text || data.reply || 'Something went wrong.',
                sender: 'AI',
                timestamp: Date.now(),
                responseMode: data.responseMode,
                editableContent: data.editableContent,
            }]);

            api.patch('/chat/seen').catch(() => {});
            if (data.editableContent) setEditableContent(data.editableContent);

        } catch (err: any) {
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                text: err?.response?.data?.error || 'Network error. Please try again.',
                sender: 'AI',
                timestamp: Date.now(),
                responseMode: 'ERROR',
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <PageTransition>
            <div style={{ maxWidth: 800, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>

                {/* ── Header ── */}
                <div style={{ flexShrink: 0, paddingBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--color-accent), #00a29f)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: 'var(--color-bg-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{ color: 'var(--color-accent)', fontWeight: 'bold', fontSize: '0.9rem', fontFamily: 'var(--font-heading)' }}>
                                {agentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'IM'}
                            </span>
                        </div>
                    </div>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                            {agentName}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <motion.span
                                animate={{ opacity: [1, 0.4, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-accent)', display: 'inline-block' }}
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-accent)', opacity: 0.8 }}>Online</span>
                        </div>
                    </div>
                </div>

                {/* ── MVP Warning ── */}
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ 
                        background: 'rgba(255, 193, 7, 0.1)', 
                        border: '1px solid rgba(255, 193, 7, 0.2)', 
                        borderRadius: '12px', 
                        padding: '8px 12px', 
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}
                >
                    <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                    <p style={{ fontSize: '0.75rem', color: '#ffc107', margin: 0, lineHeight: 1.4 }}>
                        <strong>MVP Preview:</strong> Continuous chatting is limited in this version. You may hit token limits if conversations get too long.
                    </p>
                </motion.div>

                {/* ── Messages ── */}
                <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: 16, display: 'flex', flexDirection: 'column', paddingRight: 4 }}>
                    {/* Top Anchor for Infinite Scroll */}
                    <div ref={topRef} style={{ height: 10, visibility: 'hidden' }} />
                    
                    {isLoadingMore && (
                        <div style={{ textAlign: 'center', padding: '10px 0', opacity: 0.6 }}>
                            <TypedLoading text="Fetching older messages..." />
                        </div>
                    )}

                    <AnimatePresence initial={false}>
                        {initialLoading ? (
                            <MessageSkeleton />
                        ) : (
                            <>
                                {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                                {isTyping && <TypingIndicator key="typing" />}
                            </>
                        )}
                    </AnimatePresence>
                    <div ref={bottomRef} />
                </div>

                {/* ── Input ── */}
                <div style={{ flexShrink: 0, paddingTop: 12, borderTop: '1px solid var(--glass-border)' }}>
                    <div style={{
                        display: 'flex', alignItems: 'flex-end', gap: 10,
                        background: 'var(--glass-bg)',
                        backdropFilter: 'var(--glass-blur)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 20,
                        padding: '10px 14px',
                        transition: 'border-color 0.25s, box-shadow 0.25s',
                    }}
                        onFocus={() => {/* handled per-element */ }}
                    >
                        <textarea
                            ref={textareaRef}
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isTyping}
                            placeholder={isTyping ? `${agentName} is thinking...` : 'Ask something...'}
                            rows={1}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                resize: 'none',
                                color: 'var(--color-text-primary)',
                                fontFamily: 'var(--font-body)',
                                fontSize: '0.93rem',
                                lineHeight: 1.5,
                                maxHeight: 150,
                                overflowY: 'auto',
                                opacity: isTyping ? 0.5 : 1,
                            }}
                        />
                        <motion.button
                            whileHover={!isTyping && inputValue.trim() ? { scale: 1.08 } : {}}
                            whileTap={!isTyping && inputValue.trim() ? { scale: 0.92 } : {}}
                            onClick={sendMessage}
                            disabled={isTyping || !inputValue.trim()}
                            style={{
                                flexShrink: 0,
                                width: 36, height: 36,
                                borderRadius: '50%',
                                border: 'none',
                                cursor: inputValue.trim() && !isTyping ? 'pointer' : 'default',
                                background: inputValue.trim() && !isTyping ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                                color: inputValue.trim() && !isTyping ? '#050510' : 'rgba(255,255,255,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.2s, color 0.2s',
                                boxShadow: inputValue.trim() && !isTyping ? '0 0 12px rgba(0,242,234,0.35)' : 'none',
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

            </div>
        </PageTransition>
    );
};

export default HomePage;
