import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

interface WebSocketMessage {
    type: string;
    payload?: any;
    notification?: any;
}

export const useWebSocket = () => {
    const { isAuthenticated } = useAuth();
    const ws = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

    const connect = useCallback(() => {
        if (!isAuthenticated) return;
        if (ws.current?.readyState === WebSocket.OPEN) return;

        // Determine WS URL
        // If VITE_API_URL is set, use it to construct WS URL
        let apiUrl = import.meta.env.VITE_API_URL || 'https://dreamplanner-lbm7.onrender.com';
        // Strip trailing slash and /api if present
        apiUrl = apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');

        const wsProtocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
        const wsHost = apiUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}//${wsHost}/ws`;

        console.log('🔌 Connecting to WebSocket...', wsUrl);
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('✅ WebSocket Connected');
            setIsConnected(true);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📩 WS Message:', data);
                if (data.type === 'PING') {
                    socket.send(JSON.stringify({ type: 'PONG' }));
                    return;
                }
                setLastMessage(data);
            } catch (err) {
                console.error('WS Parse Error', err);
            }
        };

        socket.onclose = (event) => {
            console.log('❌ WebSocket Disconnected', event.code, event.reason);
            setIsConnected(false);
            ws.current = null;

            // Auto-reconnect after 3s if not intentionally closed (and still authenticated)
            if (event.code !== 1000 && isAuthenticated) {
                setTimeout(connect, 3000);
            }
        };

        ws.current = socket;
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated) {
            connect();
        }
        return () => {
            ws.current?.close();
        };
    }, [isAuthenticated, connect]);

    return { isConnected, lastMessage };
};
