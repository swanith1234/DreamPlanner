import React from 'react';
import { motion } from 'framer-motion';

interface WeeklyInsightProps {
    insightType: string;
    narrative: string;
}

const WeeklyInsight: React.FC<WeeklyInsightProps> = ({ insightType, narrative }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--spacing-lg)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--spacing-xl)',
                boxShadow: 'var(--shadow-glow)'
            }}
        >
            <h3 style={{ marginBottom: 'var(--spacing-sm)', color: 'var(--color-accent)' }}>
                Weekly Verdict: {insightType.replace(/_/g, ' ')}
            </h3>
            <p style={{ lineHeight: 1.6, fontSize: '1.1rem', color: 'var(--color-text-secondary)' }}>
                {narrative || "Your weekly analysis is being processed. Check back later for personalized insights."}
            </p>
        </motion.div>
    );
};

export default WeeklyInsight;
