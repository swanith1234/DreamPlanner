import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from '../../utils/logger';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

interface WSClient extends WebSocket {
    userId?: string;
    isAlive: boolean;
}

export class NotificationWebSocketServer {
    private wss: WebSocketServer | null = null;
    private clients: Map<string, Set<WSClient>> = new Map(); // userId -> Set<WSClient>

    initialize(server: Server) {
        this.wss = new WebSocketServer({ server, path: '/ws' });

        this.wss.on('connection', async (ws: WSClient, req) => {
            ws.isAlive = true;

            // Extract cookies from headers
            const cookieHeader = req.headers.cookie;
            let token: string | undefined;

            if (cookieHeader) {
                const cookies: { [key: string]: string } = {};
                cookieHeader.split(';').forEach(cookie => {
                    const parts = cookie.split('=');
                    const name = parts[0].trim();
                    // Join the rest back in case value has =
                    const value = parts.slice(1).join('=');
                    cookies[name] = value;
                });
                token = cookies['accessToken'];
            }

            if (!token) {
                // Fallback or error
                // For now, fail if no cookie
                ws.close(1008, 'Authentication required');
                return;
            }

            try {
                // Verify token
                const decoded = jwt.verify(token, env.auth.jwtSecret) as { userId: string };
                ws.userId = decoded.userId;

                this.addClient(decoded.userId, ws);

                await logger.info('websocket', 'Client connected', {}, decoded.userId);

                ws.on('pong', () => {
                    ws.isAlive = true;
                });

                ws.on('close', () => {
                    this.removeClient(ws.userId!, ws);
                });

                // Send welcome ping
                ws.send(JSON.stringify({ type: 'WELCOME', message: 'Connected to IgniteMate Realtime' }));

            } catch (error) {
                logger.error('websocket', 'Connection authentication failed', { error: (error as Error).message });
                ws.close(1008, 'Authentication failed');
            }
        });

        // Keep-alive heartbeat
        setInterval(() => {
            this.wss?.clients.forEach((ws) => {
                const client = ws as WSClient;
                if (!client.isAlive) return client.terminate();
                client.isAlive = false;
                client.ping();
            });
        }, 30000);

        logger.info('websocket', 'WebSocket server initialized');
    }

    private addClient(userId: string, ws: WSClient) {
        if (!this.clients.has(userId)) {
            this.clients.set(userId, new Set());
        }
        this.clients.get(userId)!.add(ws);
    }

    private removeClient(userId: string, ws: WSClient) {
        const userClients = this.clients.get(userId);
        if (userClients) {
            userClients.delete(ws);
            if (userClients.size === 0) {
                this.clients.delete(userId);
            }
        }
    }

    /**
     * Send notification to a specific user
     */
    public sendToUser(userId: string, payload: any) {
        const userClients = this.clients.get(userId);
        if (!userClients) return;

        const message = JSON.stringify(payload);
        userClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    /**
     * Check if a user has at least one active WebSocket connection
     */
    public hasActiveClients(userId: string): boolean {
        const userClients = this.clients.get(userId);
        if (!userClients || userClients.size === 0) return false;
        
        let hasOpen = false;
        userClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) hasOpen = true;
        });
        return hasOpen;
    }
}

export const notificationWS = new NotificationWebSocketServer();
