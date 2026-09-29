import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isNativeApp } from '../utils/platform';
import GlowButton from '../components/GlowButton';
import PageTransition from '../components/PageTransition';
import PageLoader from '../components/PageLoader';
import styles from './LandingPage.module.css';
import heroBg from '../assets/hero-bg.png';

const Particle: React.FC<{ index: number }> = ({ index }) => {
    // Generate random values once per particle instance
    const randomDuration = 5 + (index % 5);
    const randomDelay = index % 5;

    return (
        <motion.div
            className={styles.particle}
            initial={{
                x: Math.random() * window.innerWidth, // Initial random is okay on mount
                y: window.innerHeight + 100,
                opacity: 0
            }}
            animate={{
                y: -100,
                opacity: [0, 0.8, 0],
                x: Math.random() * window.innerWidth // This might still trigger warning if re-evaluated, but cleaner
            }}
            transition={{
                duration: randomDuration,
                repeat: Infinity,
                delay: randomDelay,
                ease: "linear"
            }}
        />
    );
};

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { isAuthenticated, loading } = useAuth();

    React.useEffect(() => {
        if (loading) return;
        if (isAuthenticated) {
            navigate('/app/home', { replace: true });
        } else if (isNativeApp) {
            navigate('/login', { replace: true });
        }
    }, [isAuthenticated, loading, navigate]);

    if (loading || isAuthenticated || isNativeApp) {
        return <PageLoader />;
    }

    return (
        <PageTransition>
            <div className={styles.container}>
                {/* Animated Background Layer */}
                <motion.div
                    className={styles.background}
                    style={{ backgroundImage: `url(${heroBg})` }}
                    animate={{
                        scale: [1, 1.05, 1],
                        filter: ["brightness(1)", "brightness(1.1)", "brightness(1)"]
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                />

                {/* Overlay Gradient for Text Readability */}
                <div className={styles.overlay} />

                {/* Floating Particles (Simulated with simple divs for performance) */}
                <div className={styles.particles}>
                    {[...Array(10)].map((_, i) => (
                        <Particle key={i} index={i} />
                    ))}
                </div>

                {/* Content */}
                <div className={styles.content}>

                    <motion.h1
                        className={styles.headline}
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.5 }}
                    >
                        BREAK YOUR <span className={styles.highlight}>LIMITS</span>
                    </motion.h1>

                    <motion.p
                        className={styles.subtext}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 1 }}
                    >
                        The world is waiting for your awakening.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 1.5 }}
                    >
                        <GlowButton onClick={() => navigate('/login')}>
                            Start the Journey
                        </GlowButton>
                    </motion.div>
                </div>
            </div>
        </PageTransition>
    );
};

export default LandingPage;
