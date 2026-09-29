import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LOADING_MESSAGES = [
    "Coach is thinking...",
    "Reviewing your progress...",
    "Forging the path...",
    "Calculating impact...",
    "Aligning your goals...",
    "Structuring checkpoints..."
];

export default function TypingIndicator() {
    const [msgIndex, setMsgIndex] = useState(0);

    // Cycle text every 2.5 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
        }, 2500);
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="flex w-full justify-start mb-4"
        >
            <div className="flex flex-col items-start gap-2">

                {/* Visual blocks */}
                <div className="flex gap-1.5 p-3 rounded-2xl rounded-tl-sm bg-[var(--color-bg-secondary)] border border-[var(--color-accent)] shadow-[0_0_15px_rgba(0,242,234,0.1)]">
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_8px_rgba(0,242,234,0.6)]"
                            animate={{
                                y: ['0%', '-50%', '0%'],
                                opacity: [0.5, 1, 0.5],
                                scale: [0.9, 1.1, 0.9]
                            }}
                            transition={{
                                duration: 0.8,
                                repeat: Infinity,
                                ease: "easeInOut",
                                delay: i * 0.15
                            }}
                        />
                    ))}
                </div>

                {/* Rotating text */}
                <div className="px-1 h-5 overflow-hidden flex items-center">
                    <AnimatePresence mode="popLayout">
                        <motion.span
                            key={msgIndex}
                            initial={{ y: 15, opacity: 0, scale: 0.95 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: -15, opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="text-[12px] font-body text-[var(--color-accent)] opacity-90 block tracking-wide"
                        >
                            {LOADING_MESSAGES[msgIndex]}
                        </motion.span>
                    </AnimatePresence>
                </div>

            </div>
        </motion.div>
    );
}
