import React from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import styles from './GlassCard.module.css';

interface GlassCardProps extends HTMLMotionProps<'div'> {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'chat';
}

const GlassCard: React.FC<GlassCardProps> = ({
    children,
    className = '',
    variant = 'default',
    ...props
}) => {
    return (
        <motion.div
            className={`${styles.card} ${styles[variant]} ${className}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            layout
            {...props}
        >
            {children}
        </motion.div>
    );
};

export default GlassCard;
