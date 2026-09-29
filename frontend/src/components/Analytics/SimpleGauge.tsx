import React from 'react';
import { motion } from 'framer-motion';

interface SimpleGaugeProps {
    value: number; // 0-100
    label: string;
    color?: string;
    size?: number;
}

const SimpleGauge: React.FC<SimpleGaugeProps> = ({ value, label, color = 'var(--color-accent)', size = 120 }) => {
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div style={{ width: size, height: size, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                {/* Background Circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke="var(--color-bg-secondary)"
                    strokeWidth={strokeWidth}
                />
                {/* Progress Circle */}
                <motion.circle
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeLinecap="round"
                />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{value}%</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{label}</div>
            </div>
        </div>
    );
};

export default SimpleGauge;
