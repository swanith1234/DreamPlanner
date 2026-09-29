import React from 'react';
import { motion } from 'framer-motion';

const ThreeDLoader: React.FC = () => {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            width: '100%',
            perspective: '1000px'
        }}>
            <motion.div
                style={{
                    width: '60px',
                    height: '60px',
                    border: '4px solid transparent',
                    borderTop: '4px solid var(--color-accent)',
                    borderRight: '4px solid var(--color-accent)',
                    borderRadius: '50%',
                    position: 'absolute'
                }}
                animate={{
                    rotateX: [0, 360],
                    rotateY: [0, 360],
                    rotateZ: [0, 360],
                }}
                transition={{
                    duration: 2,
                    ease: "linear",
                    repeat: Infinity
                }}
            />
            <motion.div
                style={{
                    width: '40px',
                    height: '40px',
                    border: '4px solid transparent',
                    borderBottom: '4px solid var(--color-gold)',
                    borderLeft: '4px solid var(--color-gold)',
                    borderRadius: '50%',
                    position: 'absolute'
                }}
                animate={{
                    rotateX: [0, -360],
                    rotateY: [0, -360],
                    rotateZ: [0, -360],
                }}
                transition={{
                    duration: 1.5,
                    ease: "linear",
                    repeat: Infinity
                }}
            />
            <motion.div
                style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'white',
                    borderRadius: '50%',
                    boxShadow: '0 0 10px white'
                }}
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5]
                }}
                transition={{
                    duration: 1,
                    repeat: Infinity
                }}
            />
        </div>
    );
};

export default ThreeDLoader;
