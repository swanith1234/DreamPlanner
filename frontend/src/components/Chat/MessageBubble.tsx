import { memo } from 'react';
import { motion } from 'framer-motion';

export interface ChatMessage {
    id: string;
    text: string;
    sender: 'USER' | 'AI';
    timestamp: number;
    readAt?: number | null;
    editableContent?: string;
    responseMode?: string;
}

interface MessageBubbleProps {
    message: ChatMessage;
}

const formatTime = (ts: number) => {
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(new Date(ts));
};

const MessageBubble = memo(({ message }: MessageBubbleProps) => {
    const isUser = message.sender === 'USER';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
        >
            <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>

                {/* Bubble */}
                <motion.div
                    layout
                    className={`
                        relative px-4 py-3 shadow-sm
                        ${isUser
                            ? 'bg-[var(--color-accent)] text-[#050510] rounded-2xl rounded-tr-sm'
                            : message.responseMode === 'ERROR'
                                ? 'bg-[var(--color-bg-secondary)] text-[#ff6b6b] rounded-2xl rounded-tl-sm border border-[#ff6b6b]/30 shadow-[0_0_15px_rgba(255,107,107,0.1)]'
                                : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] rounded-2xl rounded-tl-sm border border-[var(--color-bg-secondary)] shadow-[0_0_20px_rgba(0,242,234,0.05)]'
                        }
                    `}
                >
                    <div className="whitespace-pre-wrap break-words leading-relaxed text-[15px] font-body">
                        {/* We could add true markdown parsing here later, for now raw text */}
                        {message.text}
                    </div>
                </motion.div>

                {/* Footer / Meta */}
                <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-[11px] text-[var(--color-text-secondary)] opacity-70 font-body">
                        {formatTime(message.timestamp)}
                    </span>
                    {isUser && (
                        <span className={`text-[10px] ${message.readAt ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)] opacity-50'}`}>
                            {message.readAt ? '✓✓' : '✓'}
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
});

MessageBubble.displayName = 'MessageBubble';
export default MessageBubble;
