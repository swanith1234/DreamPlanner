import React, { useState } from 'react';
import { RiNotification3Line, RiVolumeUpLine, RiMoonLine } from 'react-icons/ri';
import { isNativeApp } from '../utils/platform';
import { PushNotifications } from '@capacitor/push-notifications';
import api from '../api/client';
import GlassCard from '../components/GlassCard';
import PageTransition from '../components/PageTransition';
import PageLoader from '../components/PageLoader';
import { useTour } from '../context/TourContext';

const SettingsPage: React.FC = () => {
    const [tone, setTone] = useState<'NEUTRAL' | 'LOGICAL' | 'HARSH' | 'POSITIVE' | 'OPTIMISTIC' | 'FEAR'>('NEUTRAL');
    const [notifications, setNotifications] = useState(true);
    const [particles, setParticles] = useState(true);

    // New Preferences
    const [sleepStart, setSleepStart] = useState('23:00');
    const [sleepEnd, setSleepEnd] = useState('07:00');
    const [notificationFrequency, setNotificationFrequency] = useState(60);
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [agentName, setAgentName] = useState('');
    const [preferredName, setPreferredName] = useState('');

    const { isTourMode } = useTour();

    React.useEffect(() => {
        if (isTourMode) {
            setTone('HARSH');
            setPreferredName('Commander');
            setIsLoading(false);
            return;
        }

        const fetchPreferences = async () => {
            try {
                const { data } = await api.get('/users/preferences');
                if (data) {
                    setTone(data.motivationTone || 'NEUTRAL');
                    setNotificationFrequency(data.notificationFrequency || 60);
                    setSleepStart(data.sleepStart || '23:00');
                    setSleepEnd(data.sleepEnd || '07:00');
                    setAgentName(data.agentName || '');
                    setPreferredName(data.preferredName || '');
                }
                // Separately fetch user profile for timezone
                try {
                    const { data: me } = await api.get('/auth/me');
                    const storedTz = me?.user?.timezone;
                    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    if (!storedTz || storedTz === 'UTC') {
                        // Auto-fix: patch the backend with the correct timezone
                        await api.put('/users/profile', { timezone: browserTz });
                        setTimezone(browserTz);
                    } else {
                        setTimezone(storedTz);
                    }
                } catch { /* profile fetch failed, keep browser default */ }
            } catch (error) {
                console.error("Failed to fetch preferences", error);
            } finally {
                setIsLoading(false);
            }
        };

        const checkPushStatus = async () => {
            if (isNativeApp) {
                const permStatus = await PushNotifications.checkPermissions();
                setNotifications(permStatus.receive === 'granted');
                return;
            }
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                setNotifications(!!subscription);
            }
        }
        fetchPreferences();
        checkPushStatus();
    }, [isTourMode]);

    const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
        <div
            onClick={() => onChange(!checked)}
            style={{
                width: '48px', height: '24px', borderRadius: '12px',
                background: checked ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
            }}
        >
            <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                position: 'absolute', top: '2px', left: checked ? '26px' : '2px',
                transition: 'left 0.3s'
            }} />
        </div>
    );

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.put('/users/preferences', {
                motivationTone: tone,
                notificationFrequency,
                sleepStart,
                sleepEnd,
                quietHours: [],
                agentName,
                preferredName
            });
            // Also save timezone
            await api.put('/users/profile', { timezone });
            alert('Settings saved!');
        } catch (error) {
            console.error('Failed to save settings', error);
            alert('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <PageLoader />;

    return (
        <PageTransition>
            {isSaving && <PageLoader />}
            <div style={{ maxWidth: '600px', margin: '0 auto', paddingBottom: '120px' }}>
                <h2 style={{ marginBottom: '32px' }}>System Configuration</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Tone Section */}
                    <GlassCard>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                            <RiVolumeUpLine style={{ fontSize: '1.5rem', marginRight: '16px', color: 'var(--color-accent)' }} />
                            <div>
                                <h3 style={{ fontSize: '1.1rem' }}>Coach Personality</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>How should the system talk to you?</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {['NEUTRAL', 'LOGICAL', 'HARSH', 'POSITIVE', 'OPTIMISTIC', 'FEAR'].map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTone(t as any)}
                                    style={{
                                        flex: 1, padding: '12px', borderRadius: '8px',
                                        border: `1px solid ${tone === t ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`,
                                        background: tone === t ? 'rgba(0, 242, 234, 0.1)' : 'transparent',
                                        color: tone === t ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                        cursor: 'pointer', transition: 'all 0.3s',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {t.toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </GlassCard>

                    {/* Notifications Section */}
                    <GlassCard style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <RiNotification3Line style={{ fontSize: '1.5rem', marginRight: '16px', color: 'var(--color-gold)' }} />
                            <div>
                                <h3 style={{ fontSize: '1.1rem' }}>Notifications</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Enable system nudges</p>
                            </div>
                        </div>
                        <Toggle
                            checked={notifications}
                            onChange={async (newState) => {
                                try {
                                    setNotifications(newState);
                                    if (newState) {
                                        // ENABLE: Request permission & Subscribe
                                        if (isNativeApp) {
                                            try {
                                                let permStatus = await PushNotifications.checkPermissions();
                                                if (permStatus.receive === 'prompt') {
                                                    permStatus = await PushNotifications.requestPermissions();
                                                }
                                                if (permStatus.receive !== 'granted') {
                                                    setNotifications(false);
                                                    alert("Permission denied. Please enable notifications in your phone settings.");
                                                    return;
                                                }

                                                // Get the FCM token by listening for the registration event inline
                                                const token = await new Promise<string>((resolve, reject) => {
                                                    PushNotifications.addListener('registration', (t) => {
                                                        resolve(t.value);
                                                    });
                                                    PushNotifications.addListener('registrationError', (err) => {
                                                        reject(new Error(JSON.stringify(err)));
                                                    });
                                                    PushNotifications.register();
                                                });

                                                // Save locally for unsubscribe later
                                                localStorage.setItem('fcm_token_native', token);

                                                // Send to backend
                                                await api.post('/notifications/subscribe', {
                                                    endpoint: token,
                                                    keys: { p256dh: 'NATIVE', auth: 'NATIVE' }
                                                });

                                                alert("Notifications enabled!");
                                            } catch (err: any) {
                                                alert("Enable failed: " + (err.message || "Unknown error"));
                                                setNotifications(false);
                                            }
                                            return;
                                        }
                                        if (!('Notification' in window)) {
                                            alert("Notifications are not supported in this browser.");
                                            return;
                                        }
                                        const permission = await Notification.requestPermission();
                                        if (permission === 'granted') {
                                            if ('serviceWorker' in navigator && 'PushManager' in window) {
                                                const registration = await navigator.serviceWorker.register('/sw.js');
                                                await navigator.serviceWorker.ready;

                                                // 1. Get VAPID Key
                                                const { data } = await api.get('/notifications/vapid-key');
                                                const { publicKey } = data;

                                                // 2. Helper to convert VAPID key
                                                const urlBase64ToUint8Array = (base64String: string) => {
                                                    const padding = '='.repeat((4 - base64String.length % 4) % 4);
                                                    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
                                                    const rawData = window.atob(base64);
                                                    const outputArray = new Uint8Array(rawData.length);
                                                    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
                                                    return outputArray;
                                                }

                                                // 3. Subscribe via PushManager
                                                const subscription = await registration.pushManager.subscribe({
                                                    userVisibleOnly: true,
                                                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                                                });

                                                // 4. Send subscription to backend
                                                await api.post('/notifications/subscribe', subscription);
                                                alert("Notifications enabled successfully!");
                                            } else {
                                                alert("Push notifications are not supported in this browser.");
                                            }
                                        } else {
                                            setNotifications(false);
                                            alert("Permission denied. Please enable notifications in your browser settings.");
                                        }
                                    } else {
                                        // DISABLE: Unsubscribe
                                        if (isNativeApp) {
                                            try {
                                                const savedToken = localStorage.getItem('fcm_token_native');
                                                if (savedToken) {
                                                    // Debug alerts removed: they fired on every toggle and
                                                    // echoed a prefix of the FCM token to the screen.
                                                    console.debug('[push] unsubscribing native token');
                                                    await api.post('/notifications/unsubscribe', { endpoint: savedToken });
                                                    localStorage.removeItem('fcm_token_native');
                                                } else {
                                                    console.debug('[push] no local token to unsubscribe');
                                                }
                                            } catch (err: any) {
                                                alert("Disable failed: " + (err.message || "Unknown error"));
                                                setNotifications(true); // Revert
                                            }
                                            return;
                                        }
                                        if ('serviceWorker' in navigator) {
                                            const registration = await navigator.serviceWorker.ready;
                                            const subscription = await registration.pushManager.getSubscription();
                                            if (subscription) {
                                                await subscription.unsubscribe();
                                                await api.post('/notifications/unsubscribe', { endpoint: subscription.endpoint });
                                            }
                                        }
                                    }
                                } catch (err: any) {
                                    console.error("Notification toggle error:", err);
                                    setNotifications(!newState); // Revert state
                                    alert(`Failed to change notification settings: ${err.message}`);
                                }
                            }}
                        />
                    </GlassCard>

                    {/* Schedule Section */}
                    <GlassCard>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                            <RiMoonLine style={{ fontSize: '1.5rem', marginRight: '16px', color: 'var(--color-accent)' }} />
                            <div>
                                <h3 style={{ fontSize: '1.1rem' }}>Sleep Schedule</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Quiet hours when AI won't disturb you</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '24px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Sleep Start</label>
                                <input
                                    type="time"
                                    value={sleepStart}
                                    onChange={(e) => setSleepStart(e.target.value)}
                                    style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', outline: 'none' }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Wake Up</label>
                                <input
                                    type="time"
                                    value={sleepEnd}
                                    onChange={(e) => setSleepEnd(e.target.value)}
                                    style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', outline: 'none' }}
                                />
                            </div>
                        </div>
                    </GlassCard>

                    {/* Frequency Section */}
                    <GlassCard>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                            <RiNotification3Line style={{ fontSize: '1.5rem', marginRight: '16px', color: 'var(--color-gold)' }} />
                            <div>
                                <h3 style={{ fontSize: '1.1rem' }}>Nudge Frequency</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>How often should we check in?</p>
                            </div>
                        </div>
                        <input
                            type="range"
                            min="60"
                            max="1440"
                            step="60"
                            value={notificationFrequency}
                            onChange={(e) => setNotificationFrequency(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                        />
                        <div style={{ textAlign: 'right', marginTop: '8px', color: 'var(--color-accent)' }}>
                            Every {notificationFrequency / 60} {notificationFrequency / 60 === 1 ? 'hour' : 'hours'}
                        </div>
                    </GlassCard>

                    {/* Performance Section */}
                    <GlassCard style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <RiMoonLine style={{ fontSize: '1.5rem', marginRight: '16px', color: 'white' }} />
                            <div>
                                <h3 style={{ fontSize: '1.1rem' }}>Visual Effects</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Particles & Animations</p>
                            </div>
                        </div>
                        <Toggle checked={particles} onChange={setParticles} />
                    </GlassCard>

                    {/* AI Identity Section */}
                    <div id="tour-preferences">
                    <GlassCard>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                            <RiVolumeUpLine style={{ fontSize: '1.5rem', marginRight: '16px', color: 'var(--color-accent)' }} />
                            <div>
                                <h3 style={{ fontSize: '1.1rem' }}>AI Identity & Addressing</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Personalize how the AI interacts with you</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '24px', flexDirection: 'column' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>Agent Name (e.g. "Future Jarvis")</label>
                                <input
                                    type="text"
                                    placeholder="Leave blank for default"
                                    value={agentName}
                                    onChange={(e) => setAgentName(e.target.value)}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem' }}>How should the agent address you?</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Boss, Captain, Tony"
                                    value={preferredName}
                                    onChange={(e) => setPreferredName(e.target.value)}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', outline: 'none' }}
                                />
                            </div>
                        </div>
                    </GlassCard>
                    </div>

                </div>

                <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        style={{
                            padding: '12px 32px',
                            background: 'var(--color-accent)',
                            color: 'black',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            opacity: isSaving ? 0.7 : 1
                        }}
                    >
                        {isSaving ? 'Saving...' : 'Save Preferences'}
                    </button>
                </div>
            </div>
        </PageTransition>
    );
};

export default SettingsPage;
