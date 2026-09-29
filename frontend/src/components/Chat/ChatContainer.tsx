import { useState, useRef, useEffect } from 'react';

import MessageBubble, { type ChatMessage } from './MessageBubble';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import api from '../../api/client';

export default function ChatContainer() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [editableContent, setEditableContent] = useState<string | undefined>();
    const [agentName, setAgentName] = useState('IgniteMate');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch history or initial greeting if empty
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                // Fetch preferences first to get the personalized names
                const prefRes = await api.get('/users/preferences');
                const prefs = prefRes.data;
                const userName = prefs?.user?.name || 'Architect';
                const aName = prefs?.agentName || `Future ${userName}`;
                const pName = prefs?.preferredName || userName;
                setAgentName(aName);

                const res = await api.get('/chat/history');
                const data = res.data;
                
                if (data && data.length > 0) {
                    setMessages(data);
                    // Mark as seen once history is loaded
                    api.patch('/chat/seen').catch(() => {});
                } else {
                    setMessages([{
                        id: crypto.randomUUID(),
                        text: `Hey ${pName || 'there'}! What are we crushing today?`,
                        sender: 'AI',
                        timestamp: Date.now()
                    }]);
                }
            } catch (error) {
                console.error('Failed to fetch chat history or preferences:', error);
                setMessages([{
                    id: crypto.randomUUID(),
                    text: "Hey! What are we crushing today?",
                    sender: 'AI',
                    timestamp: Date.now()
                }]);
            }
        };
        fetchHistory();
    }, []);

    // Auto-scroll on new messages or typing state changes
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleSend = async (text: string) => {
        if (!text.trim()) return;

        // 1. Add user message
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            text,
            sender: 'USER',
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMsg]);
        setEditableContent(undefined); // Clear any pending editable content
        setIsTyping(true);

        // 2. Send to backend
        try {
            const res = await api.post('/chat', { message: text });
            const data = res.data;

            // Backend returns: { text, responseMode, editableContent? }
            if (res.status === 200) {
                const aiMsg: ChatMessage = {
                    id: crypto.randomUUID(),
                    text: data.text || data.reply, // Fallback to raw .reply if older format slips thru
                    sender: 'AI',
                    timestamp: Date.now(),
                    responseMode: data.responseMode
                };

                setMessages(prev => [...prev, aiMsg]);

                // Mark current session messages as seen
                api.patch('/chat/seen').catch(() => {});

                if (data.editableContent) {
                    setEditableContent(data.editableContent);
                }
            } else {
                // Return Error bubble
                setMessages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    text: data.error || 'Connection failed. Please try again.',
                    sender: 'AI',
                    timestamp: Date.now(),
                    responseMode: 'ERROR'
                }]);
            }

        } catch (error: any) {
            console.error('Chat error:', error);
            const errorMessage = error.response?.data?.error || 'Network error. Please check your connection.';
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                text: errorMessage,
                sender: 'AI',
                timestamp: Date.now(),
                responseMode: 'ERROR'
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--color-bg-primary)]">

            {/* Chat Header */}
            <div className="flex-none px-6 py-4 border-b border-[var(--color-bg-secondary)] flex items-center justify-between bg-[var(--color-bg-primary)]/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center border border-[var(--color-accent)]/20 shadow-[0_0_15px_rgba(0,242,234,0.1)]">
                        <img src="/logo.png" alt="logo" className="w-6 h-6 object-contain opacity-80" />
                    </div>
                    <div>
                        <h2 className="text-white font-bold text-sm tracking-tight m-0">{agentName}</h2>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] shadow-[0_0_5px_var(--color-success)] animation-pulse" />
                            <span className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-widest font-bold opacity-60">Architect Protocol Active</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Scrollable Message Feed */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 scrollbar-hide">
                <div className="max-w-4xl mx-auto flex flex-col w-full h-full justify-start pb-4">
                    {messages.map((msg) => (
                        <MessageBubble key={msg.id} message={msg} />
                    ))}

                    {isTyping && <TypingIndicator />}

                    {/* Anchor for auto-scroll */}
                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>

            {/* Input Fixed at bottom */}
            <div className="flex-none max-w-4xl mx-auto w-full pb- safe-area-inset-bottom">
                <ChatInput
                    onSend={handleSend}
                    disabled={isTyping}
                    editableContent={editableContent}
                />
            </div>

        </div>
    );
}
