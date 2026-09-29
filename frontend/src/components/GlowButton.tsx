import React from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import styles from './GlowButton.module.css';

interface GlowButtonProps extends HTMLMotionProps<'button'> {
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'ghost';
    fullWidth?: boolean;
}

const GlowButton: React.FC<GlowButtonProps> = ({
    children,
    className = '',
    variant = 'primary',
    fullWidth = false,
    ...props
}) => {
    return (
        <motion.button
            className={`${styles.button} ${styles[variant]} ${fullWidth ? styles.fullWidth : ''} ${className}`}
            whileHover={{ scale: 1.02, boxShadow: '0 0 15px var(--color-accent-glow)' }}
            whileTap={{ scale: 0.98 }}
            {...props}
        >
            {children}
        </motion.button>
    );
};

export default GlowButton;
