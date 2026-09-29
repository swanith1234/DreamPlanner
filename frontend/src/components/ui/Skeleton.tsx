import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A reusable Skeleton loading component using Tailwind pulse animation.
 * Intended to be composed mimicking the layout of the loaded component.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return (
    <div
      className={`animate-pulse bg-white/10 rounded-lg ${className}`}
      style={style}
    />
  );
};

export default Skeleton;
