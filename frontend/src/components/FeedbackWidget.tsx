import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RiBugFill, RiLightbulbFlashLine, RiCloseLine, RiSendPlaneFill, RiCheckLine } from 'react-icons/ri';
import { useLocation } from 'react-router-dom';
import api from '../api/client';
import GlassCard from './GlassCard';
import GlowButton from './GlowButton';

type FeedbackType = null | 'BUG' | 'IDEA';

export const FeedbackWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState<FeedbackType>(null);
    const [message, setMessage] = useState('');
    const [likes, setLikes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const location = useLocation();

    const handleOpen = () => {
        setIsOpen(true);
        setSuccess(false);
        setType(null);
        setMessage('');
        setLikes('');
    };

    const handleClose = () => {
        setIsOpen(false);
        setTimeout(() => setType(null), 300);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            // Include Silent Telemetry for Bugs (Trace ID & Pathname)
            const traceId = type === 'BUG' ? localStorage.getItem('lastEncounteredErrorTraceId') : null;
            const fullMessage = type === 'IDEA' 
                ? `What could we do better?\n${message}\n\nWhat do you love?\n${likes}`
                : message;

            await api.post('/feedback', {
                type,
                message: fullMessage,
                traceId,
                path: location.pathname
            });

            setSuccess(true);
            setTimeout(handleClose, 3000);
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            // Even on failure, show success to avoid frustrating the user 
            // unless we want strict error handling for feedback
            setSuccess(true);
            setTimeout(handleClose, 3000);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed bottom-24 md:bottom-6 right-6 z-50 flex items-end justify-end pointer-events-none">
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-16 right-0 mb-4 w-80 md:w-96 pointer-events-auto"
                    >
                        <GlassCard className="p-0 overflow-hidden shadow-2xl border border-white/20">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                                <h3 className="text-white font-semibold text-lg flex items-center gap-2">
                                    {type === 'BUG' ? <RiBugFill className="text-red-400" /> : type === 'IDEA' ? <RiLightbulbFlashLine className="text-yellow-400" /> : 'Feedback'}
                                    {type === 'BUG' ? 'Report Sandbox Bug' : type === 'IDEA' ? 'Suggest Idea' : 'Smart Feedback'}
                                </h3>
                                <button onClick={handleClose} className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white">
                                    <RiCloseLine size={24} />
                                </button>
                            </div>

                            {/* Content body */}
                            <div className="p-4 bg-[#0a0f18]/80 backdrop-blur-xl">
                                {success ? (
                                    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                                            <RiCheckLine size={32} className="text-green-400" />
                                        </div>
                                        <div className="text-white font-medium">Thank you!</div>
                                        <p className="text-white/60 text-sm">Your feedback helps us improve DreamPlanner.</p>
                                    </div>
                                ) : !type ? (
                                    <div className="grid grid-cols-2 gap-3 py-4">
                                        <button 
                                            onClick={() => setType('BUG')}
                                            className="flex flex-col items-center justify-center p-4 rounded-xl border border-white/10 hover:border-red-400/50 hover:bg-red-400/10 transition-all group"
                                        >
                                            <RiBugFill size={32} className="text-white/40 group-hover:text-red-400 mb-2 transition-colors" />
                                            <span className="text-sm font-medium text-white/80 group-hover:text-white">Report a Bug</span>
                                        </button>
                                        <button 
                                            onClick={() => setType('IDEA')}
                                            className="flex flex-col items-center justify-center p-4 rounded-xl border border-white/10 hover:border-yellow-400/50 hover:bg-yellow-400/10 transition-all group"
                                        >
                                            <RiLightbulbFlashLine size={32} className="text-white/40 group-hover:text-yellow-400 mb-2 transition-colors" />
                                            <span className="text-sm font-medium text-white/80 group-hover:text-white">Suggest Idea</span>
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                                        <div className="space-y-3">
                                            {type === 'BUG' ? (
                                                <div>
                                                    <label className="block text-sm font-medium text-white/80 mb-1">What went wrong?</label>
                                                    <textarea 
                                                        value={message}
                                                        onChange={(e) => setMessage(e.target.value)}
                                                        required
                                                        placeholder="Share the steps to reproduce..."
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all resize-none h-32"
                                                    />
                                                </div>
                                            ) : (
                                                <>
                                                    <div>
                                                        <label className="block text-sm font-medium text-white/80 mb-1">What could we do better?</label>
                                                        <textarea 
                                                            value={message}
                                                            onChange={(e) => setMessage(e.target.value)}
                                                            required
                                                            placeholder="I wish DreamPlanner had..."
                                                            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-all resize-none h-20"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-white/80 mb-1">What do you love? (Optional)</label>
                                                        <textarea 
                                                            value={likes}
                                                            onChange={(e) => setLikes(e.target.value)}
                                                            placeholder="My favorite feature is..."
                                                            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder-white/30 focus:outline-none focus:border-[var(--color-accent)] transition-all resize-none h-16"
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        
                                        <div className="flex justify-between items-center pt-2 mt-2 border-t border-white/10">
                                            <button 
                                                type="button" 
                                                onClick={() => setType(null)}
                                                className="text-sm text-white/60 hover:text-white transition-colors"
                                            >
                                                Back
                                            </button>
                                            <GlowButton type="submit" disabled={isSubmitting} style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
                                                {isSubmitting ? 'Sending...' : (
                                                    <span className="flex items-center gap-2">
                                                        Submit <RiSendPlaneFill />
                                                    </span>
                                                )}
                                            </GlowButton>
                                        </div>
                                        
                                    </form>
                                )}
                            </div>
                        </GlassCard>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Smart FAB toggle */}
            {!isOpen && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="pointer-events-auto">
                    <button
                        onClick={handleOpen}
                        className="w-14 h-14 bg-gradient-to-tr from-[var(--color-accent)] to-[#4fc3f7] text-white rounded-full shadow-lg shadow-cyan-500/20 flex items-center justify-center relative overflow-hidden group border border-white/20"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                        <RiLightbulbFlashLine size={24} className="relative z-10" />
                    </button>
                </motion.div>
            )}
        </div>
    );
};

export default FeedbackWidget;
