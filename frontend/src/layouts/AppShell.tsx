import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RiHome5Line,
    RiHome5Fill,
    RiDashboardLine,
    RiDashboardFill,
    RiMoonClearLine,
    RiMoonClearFill,
    RiCheckboxCircleLine,
    RiCheckboxCircleFill,
    RiSettings4Line,
    RiSettings4Fill,
    RiLogoutBoxLine,
    RiRoadMapLine
} from 'react-icons/ri';
import { PushNotifications } from '@capacitor/push-notifications';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isNativeApp } from '../utils/platform';
import styles from './AppShell.module.css';
import FeedbackWidget from '../components/FeedbackWidget';


const AppShell: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { logout } = useAuth();
    const [showNotifBanner, setShowNotifBanner] = useState(false);

    // Corrected Notification Session Logic
    useEffect(() => {
        const hasAskedThisSession = sessionStorage.getItem('asked_notifications');
        if ('Notification' in window && Notification.permission === 'default' && !hasAskedThisSession && !isNativeApp) {
            const timer = setTimeout(() => {
                setShowNotifBanner(true);
                sessionStorage.setItem('asked_notifications', 'true');
            }, 2000);
            return () => clearTimeout(timer);
        }

        if (isNativeApp) {
            const setupNativePush = async () => {
                // Register Action Types (WhatsApp-style inline reply)
                // @ts-ignore - Some versions of capacitor/push-notifications omit this from types
                await PushNotifications.registerActionTypes({
                    types: [
                        {
                            id: 'inline_reply',
                            actions: [
                                {
                                    id: 'reply',
                                    title: 'Reply',
                                    input: true,
                                    inputPlaceholder: 'Type a message...',
                                    inputButtonTitle: 'Send'
                                }
                            ]
                        }
                    ]
                });

                PushNotifications.addListener('registration', async (token) => {
                    // NOTE: this fires from PushNotificationsPlugin.register(), which
                    // calls FirebaseMessaging.getToken() directly — it does NOT depend
                    // on a MessagingService. That is why removing the plugin's
                    // MessagingService from the merged manifest (so our own service can
                    // build actionable notifications) does not break token sync.
                    console.debug('[push] native registration ok');
                    try {
                        localStorage.setItem('fcm_token_native', token.value);

                        await api.post('/notifications/subscribe', {
                            endpoint: token.value,
                            keys: {
                                p256dh: 'NATIVE',
                                auth: 'NATIVE'
                            }
                        });
                        console.debug('[push] token synced to backend');
                    } catch (err: any) {
                        const errMsg = err.response?.data?.message || err.message || 'Unknown network error';
                        console.error('[push] failed to sync native FCM token:', errMsg, err);
                    }
                });

                PushNotifications.addListener('registrationError', (error: any) => {
                    console.error('[push] native registration error:', error);
                });

                PushNotifications.addListener('pushNotificationActionPerformed', async (notification) => {
                    if (notification.actionId === 'reply' && notification.inputValue) {
                        try {
                            await api.post('/chat', { message: notification.inputValue });
                        } catch (e) {
                            console.error("Failed to send silent chat reply", e);
                        }
                    }
                });
                // Auto-register if permission already granted to ensure token is synced
                const permStatus = await PushNotifications.checkPermissions();
                if (permStatus.receive === 'granted') {
                    await PushNotifications.register();
                }
            };
            setupNativePush();
        }
    }, [isNativeApp]);

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    const enableNotifications = async () => {
        if (!('Notification' in window)) return;
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
            setShowNotifBanner(false);
            
            // Register Service Worker for Web Push
            if ('serviceWorker' in navigator) {
                const register = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                const { data: { publicKey } } = await import('../api/client').then(m => m.default.get('/notifications/vapid-key'));
                const subscription = await register.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
                await import('../api/client').then(m => m.default.post('/notifications/subscribe', subscription));
            }
        } catch (error) {
            console.error("Error subscribing", error);
        }
    };

    const baseNavItems = [
        { path: '/app/home', icon: RiHome5Line, activeIcon: RiHome5Fill, label: 'Home' },
        { path: '/app/dashboard', icon: RiDashboardLine, activeIcon: RiDashboardFill, label: 'Dashboard' },
        { path: '/app/dreams', icon: RiMoonClearLine, activeIcon: RiMoonClearFill, label: 'Dreams' },
        { path: '/app/tasks', icon: RiCheckboxCircleLine, activeIcon: RiCheckboxCircleFill, label: 'Tasks' },
        { path: '/app/settings', icon: RiSettings4Line, activeIcon: RiSettings4Fill, label: 'Settings' },
    ];

    const { user } = useAuth();
    const navItems = user?.email === 'pidugubunny534@gmail.com'
        ? [...baseNavItems, { path: '/app/admin', icon: RiCheckboxCircleLine, activeIcon: RiCheckboxCircleFill, label: 'Admin' }]
        : baseNavItems;

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className={styles.container}>

            {/* Notification Permission Modal */}
            <AnimatePresence>
                {showNotifBanner && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 2000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)'
                    }}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            style={{
                                width: '400px', maxWidth: '90%', padding: '32px',
                                background: '#0a0f18', border: '1px solid rgba(0, 242, 234, 0.2)',
                                borderRadius: '24px', textAlign: 'center', boxShadow: '0 0 40px rgba(0, 242, 234, 0.1)'
                            }}
                        >
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: 'rgba(0, 242, 234, 0.1)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px'
                            }}>
                                <RiRoadMapLine size={32} color="var(--color-accent)" />
                            </div>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '16px' }}>Stay in the Loop</h3>
                            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '32px', lineHeight: '1.6' }}>
                                Enable notifications to get real-time nudges, motivational alerts, and progress checks for your journey!
                            </p>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={() => setShowNotifBanner(false)}
                                    style={{
                                        flex: 1, padding: '12px', borderRadius: '12px',
                                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'white', fontWeight: 600, cursor: 'pointer'
                                    }}
                                >
                                    Not Now
                                </button>
                                <button
                                    onClick={() => {
                                        enableNotifications();
                                        setShowNotifBanner(false);
                                    }}
                                    style={{
                                        flex: 2, padding: '12px', borderRadius: '12px',
                                        background: 'var(--color-accent)', border: 'none',
                                        color: 'black', fontWeight: 700, cursor: 'pointer',
                                        boxShadow: '0 0 20px rgba(0, 242, 234, 0.3)'
                                    }}
                                >
                                    Enable
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Sidebar for Desktop / Hidden on Mobile */}
            {!isNativeApp && (
                <aside className={styles.sidebar}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--spacing-2xl)' }}>
                        <img src="/logo.png" alt="IgniteMate" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                        <span className={styles.logo} style={{ marginBottom: 0 }}>IgniteMate</span>
                    </div>
                    <nav className={styles.nav}>
                        {navItems.map((item) => {
                            const isActive = location.pathname.startsWith(item.path);
                            const Icon = isActive ? item.activeIcon : item.icon;

                            return (
                                <button
                                    key={item.path}
                                    className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                                    onClick={() => navigate(item.path)}
                                >
                                    <Icon className={styles.icon} />
                                    <span className={styles.label}>{item.label}</span>
                                    {isActive && <motion.div layoutId="sidebar-active" className={styles.activeIndicator} />}
                                </button>
                            );
                        })}
                    </nav>
                    <button className={styles.logoutBtn} onClick={handleLogout}>
                        <RiLogoutBoxLine />
                    </button>
                </aside>
            )}

            {/* Main Content Area */}
            <main className={styles.main} style={{ 
                paddingTop: isNativeApp ? 'max(44px, env(safe-area-inset-top))' : (showNotifBanner ? '40px' : '0'), 
                transition: 'padding-top 0.3s' 
            }}>
                <Outlet />
            </main>

            {/* Bottom Nav for Mobile / Hidden on Desktop */}
            <nav className={styles.bottomNav}>
                {navItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    const Icon = isActive ? item.activeIcon : item.icon;

                    return (
                        <button
                            key={item.path}
                            className={`${styles.mobileNavItem} ${isActive ? styles.active : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            <Icon className={styles.icon} />
                            {isActive && <motion.div layoutId="bottom-nav-active" className={styles.activeDot} />}
                        </button>
                    );
                })}
                {/* Mobile Logout Button */}
                <button
                    className={`${styles.mobileNavItem} ${styles.mobileLogoutBtn}`}
                    onClick={handleLogout}
                    style={{ color: 'var(--color-danger)' }}
                >
                    <RiLogoutBoxLine className={styles.icon} />
                </button>
            </nav>

            {/* Smart Feedback Widget */}
            <FeedbackWidget />
        </div>
    );
};

export default AppShell;
