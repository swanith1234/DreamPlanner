import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Clock, AlertTriangle, XCircle, RotateCcw,
  ChevronDown, ChevronUp, Star, StarOff, Pencil, Trash2,
  Plus, Settings, Save
} from 'lucide-react';

interface MilestoneCardProps {
  milestone: any;
  index: number;
  total: number;
  isEditMode: boolean;
  onComplete: (id: string) => void;
  onUpdate: (id: string, data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const STATUS_CONFIG: Record<string, { icon: React.FC<any>; color: string; bg: string; label: string }> = {
  COMPLETED:         { icon: CheckCircle2, color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Completed' },
  IN_PROGRESS:       { icon: Clock,        color: '#00f2ea', bg: 'rgba(0,242,234,0.1)',   label: 'In Progress' },
  PENDING:           { icon: Clock,        color: '#6b7280', bg: 'rgba(107,114,128,0.1)', label: 'Pending' },
  FAILED:            { icon: XCircle,      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'Failed' },
  REVISION_REQUIRED: { icon: AlertTriangle,color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: 'Revision' },
};

const MilestoneCard: React.FC<MilestoneCardProps> = ({
  milestone, index, total, isEditMode, onComplete, onUpdate, onDelete
}) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(milestone.title);
  const [editDetail, setEditDetail] = useState(milestone.targetUserState || '');
  const [editDifficulty, setEditDifficulty] = useState(milestone.difficultyLevel || 3);
  const [saving, setSaving] = useState(false);

  const cfg = STATUS_CONFIG[milestone.status] || STATUS_CONFIG.PENDING;
  const StatusIcon = cfg.icon;
  const isCompleted = milestone.status === 'COMPLETED';
  const isActive   = milestone.status === 'IN_PROGRESS';
  const isFailed   = milestone.status === 'FAILED' || milestone.status === 'REVISION_REQUIRED';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(milestone.id, { title: editTitle, targetUserState: editDetail, difficultyLevel: editDifficulty });
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 200, damping: 24 }}
      style={{ position: 'relative', marginBottom: 0 }}
    >
      {/* Timeline line */}
      {index < total - 1 && (
        <div style={{
          position: 'absolute', left: 23, top: '100%', width: 2, height: 20,
          background: isCompleted
            ? 'linear-gradient(to bottom, #10b981, rgba(16,185,129,0.15))'
            : 'linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
          zIndex: 1,
        }} />
      )}

      <div
        style={{
          display: 'flex', gap: 14, padding: '16px 0',
          opacity: isCompleted ? 0.75 : 1,
        }}
      >
        {/* Left: Status dot + line */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <motion.div
            whileTap={{ scale: 0.9 }}
            style={{
              width: 46, height: 46, borderRadius: '50%',
              background: cfg.bg,
              border: `2px solid ${isActive ? cfg.color : 'rgba(255,255,255,0.1)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isActive ? `0 0 16px ${cfg.color}55, 0 0 32px ${cfg.color}22` : 'none',
              position: 'relative', zIndex: 2, flexShrink: 0,
              cursor: isEditMode ? 'default' : 'pointer',
            }}
            onClick={() => { if (!isEditMode && !isCompleted) onComplete(milestone.id); }}
          >
            <StatusIcon size={20} color={cfg.color} />
            {isActive && (
              <motion.div
                animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ repeat: Infinity, duration: 2 }}
                style={{
                  position: 'absolute', inset: -4, borderRadius: '50%',
                  border: `2px solid ${cfg.color}`,
                  pointerEvents: 'none',
                }}
              />
            )}
          </motion.div>
        </div>

        {/* Right: Card content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              background: isActive
                ? 'linear-gradient(135deg, rgba(0,242,234,0.06), rgba(0,100,120,0.08))'
                : isCompleted
                ? 'rgba(16,185,129,0.04)'
                : isFailed
                ? 'rgba(239,68,68,0.04)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isActive ? 'rgba(0,242,234,0.2)' : isCompleted ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 16,
              overflow: 'hidden',
              transition: 'all 0.2s',
            }}
          >
            {/* Card header */}
            <div
              style={{ padding: '14px 16px', cursor: 'pointer' }}
              onClick={() => setExpanded(e => !e)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Step badge + status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.15em',
                      color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
                      fontFamily: 'Inter, sans-serif',
                    }}>
                      Step {index + 1} of {total}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
                      fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em',
                    }}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 style={{
                    fontSize: 16, fontWeight: 700, color: isCompleted ? 'rgba(255,255,255,0.45)' : '#fff',
                    fontFamily: 'Inter, sans-serif', lineHeight: 1.3, margin: 0,
                    textDecoration: isCompleted ? 'line-through' : 'none',
                  }}>
                    {milestone.title}
                  </h3>

                  {/* Difficulty stars */}
                  <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
                    {[1, 2, 3, 4, 5].map(s => s <= (milestone.difficultyLevel || 3)
                      ? <Star key={s} size={10} fill="#b8860b" color="#b8860b" />
                      : <StarOff key={s} size={10} color="rgba(255,255,255,0.12)" />
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {isEditMode && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditing(true); setExpanded(true); }}
                        style={{
                          width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(0,242,234,0.2)',
                          background: 'rgba(0,242,234,0.08)', color: '#00f2ea', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(milestone.id); }}
                        style={{
                          width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                          background: 'rgba(239,68,68,0.08)', color: '#ef4444', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                  {expanded
                    ? <ChevronUp size={16} color="rgba(255,255,255,0.35)" />
                    : <ChevronDown size={16} color="rgba(255,255,255,0.35)" />
                  }
                </div>
              </div>
            </div>

            {/* Expanded content */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {editing ? (
                      /* Edit form */
                      <div style={{ paddingTop: 14 }}>
                        <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', display: 'block', marginBottom: 6 }}>Title</label>
                        <input
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          autoFocus
                          style={{
                            width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 15, fontWeight: 600,
                            fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                        <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', display: 'block', marginBottom: 6, marginTop: 12 }}>Target State</label>
                        <textarea
                          value={editDetail}
                          onChange={e => setEditDetail(e.target.value)}
                          rows={2}
                          style={{
                            width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13,
                            fontFamily: 'Inter,sans-serif', outline: 'none', resize: 'none', boxSizing: 'border-box',
                          }}
                        />
                        <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', display: 'block', marginBottom: 8, marginTop: 12 }}>Difficulty</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <button key={s} onClick={() => setEditDifficulty(s)} type="button"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 22,
                                color: s <= editDifficulty ? '#b8860b' : 'rgba(255,255,255,0.15)' }}
                            >★</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                          <button onClick={() => setEditing(false)}
                            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter,sans-serif',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                          <button onClick={handleSave} disabled={saving}
                            style={{ flex: 2, padding: '10px', borderRadius: 10, border: '1px solid rgba(0,242,234,0.3)',
                              background: 'rgba(0,242,234,0.12)', color: '#00f2ea', fontFamily: 'Inter,sans-serif',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', gap: 6 }}>
                            <Save size={13} />{saving ? 'Saving…' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View content */
                      <div style={{ paddingTop: 12 }}>
                        {milestone.targetUserState && (
                          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6,
                            fontFamily: 'Inter,sans-serif', margin: '0 0 14px' }}>
                            {milestone.targetUserState}
                          </p>
                        )}
                        {!isEditMode && !isCompleted && (
                          <button
                            onClick={() => onComplete(milestone.id)}
                            style={{
                              width: '100%', padding: '12px', borderRadius: 12,
                              background: isActive ? 'rgba(0,242,234,0.12)' : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${isActive ? 'rgba(0,242,234,0.3)' : 'rgba(255,255,255,0.1)'}`,
                              color: isActive ? '#00f2ea' : 'rgba(255,255,255,0.5)',
                              fontFamily: 'Inter,sans-serif', fontSize: 12, fontWeight: 700,
                              cursor: 'pointer', letterSpacing: '0.05em',
                            }}
                          >
                            {isActive ? '⚡ Start Assessment' : 'Mark as Complete →'}
                          </button>
                        )}
                        {isFailed && !isEditMode && (
                          <button
                            onClick={() => onComplete(milestone.id)}
                            style={{
                              width: '100%', padding: '12px', borderRadius: 12,
                              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                              color: '#ef4444', fontFamily: 'Inter,sans-serif', fontSize: 12,
                              fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            <RotateCcw size={13} style={{ display: 'inline', marginRight: 6 }} />
                            Retry Assessment
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/* ─────────────────────────────────────────── */

interface MobileRoadmapViewProps {
  milestones: any[];
  isEditMode: boolean;
  isSaving: boolean;
  onToggleEdit: () => void;
  onCompleteMilestone: (id: string) => void;
  onUpdateMilestone: (id: string, data: any) => Promise<void>;
  onDeleteMilestone: (id: string) => Promise<void>;
  onAddMilestone: (data: any) => Promise<void>;
  etaGraduationDate?: string;
}

const MobileRoadmapView: React.FC<MobileRoadmapViewProps> = ({
  milestones, isEditMode, isSaving, onToggleEdit,
  onCompleteMilestone, onUpdateMilestone, onDeleteMilestone, onAddMilestone,
}) => {
  const [addTitle, setAddTitle] = useState('');
  const [addDetail, setAddDetail] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  const completed = milestones.filter(m => m.status === 'COMPLETED').length;
  const pct = milestones.length > 0 ? Math.round((completed / milestones.length) * 100) : 0;

  const handleAdd = async () => {
    if (!addTitle.trim()) return;
    setAddSaving(true);
    try {
      await onAddMilestone({ title: addTitle.trim(), targetUserState: addDetail.trim(), orderIndex: milestones.length + 1 });
      setShowAddModal(false);
      setAddTitle('');
      setAddDetail('');
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #080d14 0%, #0a1020 100%)',
      paddingBottom: 100,
    }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(8,13,20,0.92)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="5" fill="#00f2ea" opacity="0.8" />
              <circle cx="6" cy="8" r="3" fill="#00f2ea" opacity="0.4" />
              <circle cx="26" cy="8" r="3" fill="#00f2ea" opacity="0.4" />
              <circle cx="6" cy="24" r="3" fill="#00f2ea" opacity="0.4" />
              <circle cx="26" cy="24" r="3" fill="#00f2ea" opacity="0.4" />
              <line x1="16" y1="16" x2="6" y2="8" stroke="#00f2ea" strokeWidth="1.5" opacity="0.4" />
              <line x1="16" y1="16" x2="26" y2="8" stroke="#00f2ea" strokeWidth="1.5" opacity="0.4" />
              <line x1="16" y1="16" x2="6" y2="24" stroke="#00f2ea" strokeWidth="1.5" opacity="0.4" />
              <line x1="16" y1="16" x2="26" y2="24" stroke="#00f2ea" strokeWidth="1.5" opacity="0.4" />
            </svg>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.1em', fontFamily: 'Inter,sans-serif' }}>
                AETHERFLOW
              </div>
              <div style={{ fontSize: 10, color: 'rgba(0,242,234,0.7)', fontFamily: 'Inter,sans-serif', fontWeight: 600 }}>
                {completed}/{milestones.length} milestones complete
              </div>
            </div>
          </div>

          {/* Edit toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isSaving && (
              <span style={{ fontSize: 10, color: '#00f2ea', fontFamily: 'Inter,sans-serif', fontWeight: 600 }}>
                <Save size={10} style={{ display: 'inline', marginRight: 4 }} />Saving…
              </span>
            )}
            <button
              onClick={onToggleEdit}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 20,
                background: isEditMode ? 'rgba(0,242,234,0.15)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${isEditMode ? 'rgba(0,242,234,0.4)' : 'rgba(255,255,255,0.12)'}`,
                color: isEditMode ? '#00f2ea' : 'rgba(255,255,255,0.6)',
                fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.08em',
              }}
            >
              <Settings size={13} />
              {isEditMode ? 'EDITING' : 'EDIT'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 6, height: 5, overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{
              height: '100%', borderRadius: 6,
              background: 'linear-gradient(90deg, #00f2ea, #10b981)',
              boxShadow: '0 0 10px rgba(0,242,234,0.4)',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter,sans-serif', fontWeight: 600 }}>PROGRESS</span>
          <span style={{ fontSize: 9, color: '#00f2ea', fontFamily: 'Inter,sans-serif', fontWeight: 700 }}>{pct}%</span>
        </div>
      </div>

      {/* ── Milestone list ── */}
      <div style={{ padding: '20px 16px 0' }}>
        {milestones.map((m, i) => (
          <MilestoneCard
            key={m.id}
            milestone={m}
            index={i}
            total={milestones.length}
            isEditMode={isEditMode}
            onComplete={onCompleteMilestone}
            onUpdate={onUpdateMilestone}
            onDelete={onDeleteMilestone}
          />
        ))}

        {milestones.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)', fontFamily: 'Inter,sans-serif' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            <p style={{ fontSize: 14 }}>No milestones yet. Generate your roadmap.</p>
          </div>
        )}
      </div>

      {/* ── FAB: Add milestone (edit mode only) ── */}
      <AnimatePresence>
        {isEditMode && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setShowAddModal(true)}
            style={{
              position: 'fixed', bottom: 28, right: 20, zIndex: 200,
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00f2ea, #0891b2)',
              border: 'none', color: '#000', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,242,234,0.5), 0 0 40px rgba(0,242,234,0.2)',
            }}
          >
            <Plus size={24} strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Add Milestone modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowAddModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 520,
                background: 'linear-gradient(160deg, #0f141e, #141a28)',
                border: '1px solid rgba(0,242,234,0.15)',
                borderRadius: '24px 24px 0 0',
                padding: '28px 20px 40px',
              }}
            >
              {/* Drag indicator */}
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />
              <h3 style={{ fontFamily: 'Inter,sans-serif', fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 20 }}>
                Add New Milestone
              </h3>
              <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', display: 'block', marginBottom: 6 }}>Title</label>
              <input
                value={addTitle}
                onChange={e => setAddTitle(e.target.value)}
                autoFocus
                placeholder="e.g. Master React Hooks"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12, padding: '12px 16px', color: '#fff', fontSize: 15, fontWeight: 600,
                  fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box', marginBottom: 14,
                }}
              />
              <label style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif', display: 'block', marginBottom: 6 }}>Target State (optional)</label>
              <textarea
                value={addDetail}
                onChange={e => setAddDetail(e.target.value)}
                rows={2}
                placeholder="What should be achieved?"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12, padding: '12px 16px', color: '#fff', fontSize: 13,
                  fontFamily: 'Inter,sans-serif', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 20,
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowAddModal(false)}
                  style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)',
                    fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleAdd} disabled={!addTitle.trim() || addSaving}
                  style={{ flex: 2, padding: 14, borderRadius: 12, border: '1px solid rgba(0,242,234,0.3)',
                    background: addTitle.trim() ? 'rgba(0,242,234,0.15)' : 'rgba(255,255,255,0.05)',
                    color: addTitle.trim() ? '#00f2ea' : 'rgba(255,255,255,0.3)',
                    fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {addSaving ? 'Adding…' : '+ Add Milestone'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobileRoadmapView;
