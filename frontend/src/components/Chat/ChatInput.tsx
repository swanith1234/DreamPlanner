import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { FiSend } from 'react-icons/fi';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    editableContent?: string;
}

export default function ChatInput({ onSend, disabled, editableContent }: ChatInputProps) {
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-populate when the backend sends editable content (e.g. checkpoints)
    useEffect(() => {
        if (editableContent) {
            setValue(editableContent);
            // Focus and move cursor to the end
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                    textareaRef.current.selectionStart = textareaRef.current.value.length;
                    textareaRef.current.selectionEnd = textareaRef.current.value.length;
                }
            }, 50);
        }
    }, [editableContent]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;

        // Reset height to compute actual scrollHeight
        ta.style.height = 'auto';
        // Max height ~ 150px
        ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
    }, [value]);

    const handleSend = () => {
        if (!value.trim() || disabled) return;
        onSend(value.trim());
        setValue('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex items-end gap-2 bg-[var(--color-bg-primary)] p-4 border-t border-[var(--color-bg-secondary)] relative z-10">
            <motion.div 
                className={`
                    flex-1 relative bg-[var(--color-bg-secondary)] rounded-2xl md:rounded-3xl border 
                    transition-all duration-300 px-4 py-3
                    ${disabled ? 'border-[var(--color-accent)] shadow-[0_0_20px_rgba(0,242,234,0.15)]' : 'border-[var(--color-glass-border)] focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_15px_rgba(0,242,234,0.1)]'}
                `}
                animate={disabled ? {
                    boxShadow: ['0 0 10px rgba(0,242,234,0.1)', '0 0 25px rgba(0,242,234,0.25)', '0 0 10px rgba(0,242,234,0.1)'],
                    borderColor: ['rgba(0,242,234,0.4)', 'rgba(0,242,234,0.8)', 'rgba(0,242,234,0.4)']
                } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >

                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={disabled ? "Coach is executing..." : "Ask something..."}
                    rows={1}
                    className="w-full bg-transparent text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] font-body text-sm resize-none outline-none overflow-y-auto disabled:opacity-70 scrollbar-hide py-1 max-h-[150px]"
                />
            </motion.div>

            <motion.button
                whileHover={!disabled && value.trim() ? { scale: 1.05 } : {}}
                whileTap={!disabled && value.trim() ? { scale: 0.95 } : {}}
                onClick={handleSend}
                disabled={disabled || !value.trim()}
                className={`
                    flex-none h-12 w-12 rounded-full flex items-center justify-center transition-all duration-300 relative overflow-hidden
                    ${value.trim() && !disabled
                        ? 'bg-[var(--color-accent)] text-[#050510] shadow-[0_0_15px_rgba(0,242,234,0.3)]'
                        : disabled
                            ? 'bg-transparent border border-[var(--color-accent)] text-[var(--color-accent)]'
                            : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] cursor-not-allowed opacity-50'
                    }
                `}
            >
                {disabled ? (
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent border-r-transparent rounded-full"
                    />
                ) : (
                    <FiSend size={20} className="ml-1 z-10 relative" />
                )}
            </motion.button>
        </div>
    );
}
