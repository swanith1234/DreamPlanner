import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Settings } from 'lucide-react';
import type { ETAMetrics } from '../../utils/etaEngine';
import './CorkboardRoadmap.css';

interface HUDProps {
  progress?: number;
  etaMetrics: ETAMetrics;
  nextNodeTitle?: string;
  isEditMode: boolean;
  onToggleEdit: () => void;
  isSaving?: boolean;
  totalSkills?: number;
  completedSkills?: number;
  deadlineDays?: number;
}

const SlotText = ({ text, className, color }: { text: string | number, className?: string, color?: string }) => (
  <div style={{ display: 'inline-flex', overflow: 'hidden', position: 'relative' }} className={className}>
    <AnimatePresence mode="popLayout">
      <motion.span
        key={String(text)}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ color, fontFamily: 'Roboto Mono, Fira Code, monospace', fontWeight: 600 }}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  </div>
);

const HUD: React.FC<HUDProps> = ({
  etaMetrics,
  nextNodeTitle,
  isEditMode,
  onToggleEdit,
  isSaving,
}) => {
  const { delta, projectedGraduationDate, nextActionLeverage } = etaMetrics;

  const graduationStr = useMemo(() => {
    return projectedGraduationDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [projectedGraduationDate]);

  const deltaUI = useMemo(() => {
    if (delta <= 0) {
      return { 
        text: `↓ ${delta} Days (Accelerating)`, 
        color: '#10B981',
        shadow: '0 0 10px rgba(16,185,129,0.5)' 
      };
    } else {
      return { 
        text: `↑ +${delta} Days (Slipping)`, 
        color: '#EF4444',
        shadow: '0 0 10px rgba(239,68,68,0.5)' 
      };
    }
  }, [delta]);

  const leverageText = useMemo(() => {
    if (!nextNodeTitle) return 'Mission clear. Target secured.';
    return `Completing "${nextNodeTitle}" pulls Target forward by ${nextActionLeverage}d.`;
  }, [nextNodeTitle, nextActionLeverage]);

  return (
    <div className="corkboard-header" style={{ padding: '16px 24px', background: 'rgba(10, 15, 25, 0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      
      {/* Left — Brand */}
      <div className="corkboard-brand" style={{ flex: 1 }}>
        <svg className="corkboard-brand-icon" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="5" fill="currentColor" opacity="0.8" />
          <circle cx="6" cy="8" r="3" fill="currentColor" opacity="0.5" />
          <circle cx="26" cy="8" r="3" fill="currentColor" opacity="0.5" />
          <circle cx="6" cy="24" r="3" fill="currentColor" opacity="0.5" />
          <circle cx="26" cy="24" r="3" fill="currentColor" opacity="0.5" />
          <line x1="16" y1="16" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <line x1="16" y1="16" x2="26" y2="8" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <line x1="16" y1="16" x2="6" y2="24" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <line x1="16" y1="16" x2="26" y2="24" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        </svg>
        <span className="corkboard-brand-text" style={{ fontSize: '1rem', letterSpacing: '2px', color: '#fff', marginLeft: 8 }}>AETHERFLOW</span>
        <span style={{ fontSize: '10px', color: '#00f2ea', marginLeft: 12, fontWeight: 700, letterSpacing: '1px', padding: '2px 6px', border: '1px solid rgba(0,242,234,0.3)', borderRadius: '4px' }}>v2.1 GROMMET FIX</span>
      </div>

      {/* Center — Telemetry Dashboard */}
      <div style={{ display: 'flex', gap: '48px', flex: 2, justifyContent: 'center' }}>
        
        {/* Zone 1: The Absolute Target */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>PROJECTED GRADUATION</span>
          <SlotText text={graduationStr} color="#ffffff" className="hud-metric-value" />
        </div>

        {/* Zone 2: The Velocity Delta */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>PACE DELTA</span>
          <div style={{ textShadow: deltaUI.shadow }}>
            <SlotText text={deltaUI.text} color={deltaUI.color} className="hud-metric-value" />
          </div>
        </div>

        {/* Zone 3: Leverage Action */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 300, textAlign: 'center' }}>
          <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>NEXT ACTION LEVERAGE</span>
          <span style={{ color: '#06b6d4', fontSize: '12px', lineHeight: 1.4, textShadow: '0 0 8px rgba(6,182,212,0.4)', fontFamily: 'Roboto Mono, Fira Code, monospace' }}>
            {leverageText}
          </span>
        </div>

      </div>

      {/* Right — Controls */}
      <div className="corkboard-controls" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex', gap: 16 }}>
        {isSaving && (
          <div className="corkboard-saving">
            <Save className="corkboard-saving-icon" size={14} />
            <span className="corkboard-saving-text">Auto-saving…</span>
          </div>
        )}

        <div className="corkboard-control-labels">
          <span className={`corkboard-control-label ${!isEditMode ? 'corkboard-control-label-active' : ''}`}>
            {isEditMode ? 'Edit Mode' : 'Architect Mode'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            className={`corkboard-toggle ${isEditMode ? 'active' : ''}`}
            onClick={onToggleEdit}
            aria-label="Toggle edit mode"
          >
            <motion.div
              className="corkboard-toggle-handle"
              animate={{ x: isEditMode ? 28 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Settings size={14} />
            </motion.div>
          </button>
          <div className={`corkboard-led ${isEditMode ? '' : 'on'}`} />
        </div>
      </div>
    </div>
  );
};

export default HUD;
