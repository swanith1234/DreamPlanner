import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';
import axios from 'axios';

interface User {
    id: string;
    email: string;
    name: string;
    preferences?: {
        agentName?: string;
        motivationTone?: string;
    };
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (user: User) => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Wakes up the Render backend + checks auth within a timeout.
// If the backend takes > 12 s (cold start), we treat the user as not logged in
// so the UI doesn't stay black forever — the user can try again once it's warm.


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();

        const checkAuth = async () => {
            try {
                const { data } = await api.get('/auth/me', {
                    signal: controller.signal,
                });
                setUser(data.user);
                setLoading(false);
            } catch (error: any) {
                // Ignore aborts from React Strict Mode double-mounting
                if (error.name === 'CanceledError' || error.message?.includes('aborted') || axios.isCancel(error)) {
                    return; // Do NOT set loading to false; let the second mount finish
                }
                
                setUser(null);
                setLoading(false);
            }
        };

        checkAuth();

        return () => {
            controller.abort();
        };
    }, []);

    const login = (newUser: User) => {
        setUser(newUser);
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (e) {
            console.error('Logout API failed', e);
        }
        setUser(null);
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
