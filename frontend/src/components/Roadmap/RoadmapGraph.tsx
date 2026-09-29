import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
  ReactFlowProvider,
  ConnectionMode,
} from '@xyflow/react';
import type {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  OnReconnect,
  Connection,
  NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, SkipForward, Plus } from 'lucide-react';

import CustomNode from './CustomNode';
import HUD from './HUD';
import MobileRoadmapView from './MobileRoadmapView';
import { calculatePredictiveETA } from '../../utils/etaEngine';
import './CorkboardRoadmap.css';

const nodeTypes: NodeTypes = { dreamNode: CustomNode };

interface RoadmapGraphProps {
  milestones: any[];
  onCompleteMilestone?: (milestoneId: string) => void;
  onUpdateMilestone?: (milestoneId: string, data: any) => Promise<void>;
  onUpdateMilestoneStatus?: (milestoneId: string, status: string) => Promise<void>;
  onAddMilestone?: (data: any) => Promise<void>;
  onDeleteMilestone?: (milestoneId: string) => Promise<void>;
  dreamDeadline?: string | Date;
}

const LOCAL_STORAGE_KEY = 'dream-planner-roadmap-layout';

const RoadmapGraphContent: React.FC<RoadmapGraphProps> = ({
  milestones,
  onCompleteMilestone,
  onUpdateMilestone,
  onUpdateMilestoneStatus,
  onAddMilestone,
  onDeleteMilestone,
  dreamDeadline,
}) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // --- MODALS ---
  // Confirm popup (architecture mode click)
  const [confirmNode, setConfirmNode] = useState<{ id: string; title: string } | null>(null);
  // Failure modal (clicking a failed node)
  const [failedNode, setFailedNode] = useState<{ id: string; title: string } | null>(null);
  // Edit modal (edit mode double-click)
  const [editModal, setEditModal] = useState<{ nodeId: string; title: string; detail: string; difficulty: number; status: string; originalStatus: string } | null>(null);
  // Add node modal
  const [addModal, setAddModal] = useState<{ milestoneId: string } | null>(null);
  const [addTitle, setAddTitle] = useState('');
  const [addDetail, setAddDetail] = useState('');

  // Position save debounce
  const saveTimeout = useRef<any>(null);

  // Metrics
  const { totalSkills, completedSkills, deadlineDays } = useMemo(() => {
    let total = 0;
    let completed = 0;
    milestones.forEach((m) => {
      total++;
      if (m.status === 'COMPLETED') completed++;
    });
    let days: number | undefined;
    if (dreamDeadline) {
      const deadlineDate = typeof dreamDeadline === 'string' ? new Date(dreamDeadline) : dreamDeadline;
      days = Math.max(0, Math.ceil((deadlineDate.getTime() - Date.now()) / 86400000));
    }
    return { totalSkills: total, completedSkills: completed, deadlineDays: days };
  }, [milestones, dreamDeadline]);

  // Delete node handler passed to CustomNode
  const handleDeleteNode = useCallback(async (nodeId: string) => {
    if (onDeleteMilestone) {
      await onDeleteMilestone(nodeId);
    }
    // Also remove from local state immediately
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [onDeleteMilestone]);

  // --- CLICK HANDLERS ---
  // Architecture mode: click → confirm popup
  // Edit mode: click does nothing (editing is via double-click)
  const onNodeClick = useCallback((_: any, node: Node) => {
    if (isEditMode) return; // No action on single click in edit mode
    const status = (node.data as any)?.status;
    if (status === 'FAILED' || status === 'REVISION_REQUIRED') {
      setFailedNode({ id: node.id, title: (node.data as any)?.label || 'Node' });
    } else {
      // Show confirm popup before assessment
      setConfirmNode({ id: node.id, title: (node.data as any)?.label || 'Node' });
    }
  }, [isEditMode]);

  // Edit mode: double-click → edit modal
  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    if (!isEditMode) return;
    setEditModal({
      nodeId: node.id,
      title: (node.data as any)?.label || '',
      detail: (node.data as any)?.targetUserState || '',
      difficulty: (node.data as any)?.difficulty || 3,
      status: (node.data as any)?.status || 'PENDING',
      originalStatus: (node.data as any)?.status || 'PENDING',
    });
  }, [isEditMode]);

  // Confirm → proceed to assessment
  const handleConfirmYes = useCallback(() => {
    if (confirmNode && onCompleteMilestone) onCompleteMilestone(confirmNode.id);
    setConfirmNode(null);
  }, [confirmNode, onCompleteMilestone]);

  // Save edit
  const handleSaveEdit = useCallback(async () => {
    if (!editModal || !onUpdateMilestone) return;
    
    if (editModal.status === 'COMPLETED' && editModal.originalStatus !== 'COMPLETED') {
        if (onCompleteMilestone) {
            onCompleteMilestone(editModal.nodeId);
        }
        setEditModal(null);
        return;
    }

    setIsSaving(true);
    try {
      await onUpdateMilestone(editModal.nodeId, { title: editModal.title, targetUserState: editModal.detail, difficultyLevel: editModal.difficulty, status: editModal.status });
    } finally {
      setIsSaving(false);
      setEditModal(null);
    }
  }, [editModal, onUpdateMilestone, onCompleteMilestone]);

  // Delete from edit modal
  const handleDeleteFromModal = useCallback(async () => {
    if (!editModal) return;
    await handleDeleteNode(editModal.nodeId);
    setEditModal(null);
  }, [editModal, handleDeleteNode]);

  // Add new node
  const handleAddNode = useCallback(async () => {
    if (!addModal || !onAddMilestone || !addTitle.trim()) return;
    setIsSaving(true);
    try {
      await onAddMilestone({ title: addTitle.trim(), targetUserState: addDetail.trim(), orderIndex: milestones.length + 1 });
    } finally {
      setIsSaving(false);
      setAddModal(null);
      setAddTitle('');
      setAddDetail('');
    }
  }, [addModal, addTitle, addDetail, onAddMilestone, milestones.length]);

  // Failure flow
  const handleRetry = useCallback(() => {
    if (failedNode && onCompleteMilestone) onCompleteMilestone(failedNode.id);
    setFailedNode(null);
  }, [failedNode, onCompleteMilestone]);

  const handleSkipToNext = useCallback(async () => {
    if (failedNode && onUpdateMilestoneStatus) await onUpdateMilestoneStatus(failedNode.id, 'REVISION_REQUIRED');
    setFailedNode(null);
  }, [failedNode, onUpdateMilestoneStatus]);

  // --- Load saved positions ONCE on mount (never clear them on re-render) ---
  const savedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.positions) savedPositionsRef.current = parsed.positions;
      }
    } catch {/* ignore */}
  }, []); // mount only — never wipe positions on re-render

  // --- INIT NODES (rebuilds graph when milestones or edit mode changes) ---
  useEffect(() => {
    const savedPositions = savedPositionsRef.current; // read from ref, not localStorage

    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];
    const COLUMN_WIDTH = 260;
    const HEADER_OFFSET = 100;
    
    const startX = Math.max(60, (1100 - milestones.length * COLUMN_WIDTH) / 2);

    const activeOrInProgressExists = milestones.some((m: any) => m.status === 'IN_PROGRESS' || m.status === 'ACTIVE');
    const firstPendingIdx = milestones.findIndex((m: any) => m.status === 'PENDING');

    milestones.forEach((m: any, mIdx: number) => {
      const nodeId = m.id;
      const saved = savedPositions[nodeId];

      let computedStatus = m.status;
      if (!activeOrInProgressExists && mIdx === firstPendingIdx) {
        computedStatus = 'IN_PROGRESS';
      }

      const category = m.title?.split(':')[0] || (
        computedStatus === 'COMPLETED' ? 'Done' : computedStatus === 'FAILED' ? 'Retry' :
        computedStatus === 'REVISION_REQUIRED' ? 'Revision' : computedStatus === 'IN_PROGRESS' ? 'In Progress' : 'Pending'
      );

      initialNodes.push({
        id: nodeId,
        type: 'dreamNode',
        position: saved || { x: startX + mIdx * COLUMN_WIDTH, y: HEADER_OFFSET + 100 },
        data: {
          label: m.title,
          difficulty: m.difficultyLevel || 3,
          status: computedStatus,
          isEditMode,
          category: category.trim(),
          targetUserState: m.targetUserState || '',
          onDeleteNode: handleDeleteNode,
        },
        draggable: isEditMode,
      });

      if (m.parentIds && m.parentIds.length > 0) {
        m.parentIds.forEach((pId: string) => {
          const parentMile = milestones.find((mi: any) => mi.id === pId);
          const isDone = parentMile?.status === 'COMPLETED';
          initialEdges.push({
            id: `e-${pId}-${nodeId}`,
            source: pId,
            target: nodeId,
            animated: computedStatus === 'IN_PROGRESS',
            style: {
              stroke: isDone ? '#2d6a4f' : computedStatus === 'IN_PROGRESS' ? '#00f2ea' : '#8B6914',
              strokeWidth: computedStatus === 'IN_PROGRESS' ? 2 : 2.5,
              filter: computedStatus === 'IN_PROGRESS' ? 'drop-shadow(0 0 6px rgba(0,242,234,0.5))' : 'none',
            },
          });
        });
      }
    });

    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [milestones, isEditMode, handleDeleteNode]);

  // Sync isEditMode to existing nodes
  useEffect(() => {
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: { ...n.data, isEditMode, onDeleteNode: handleDeleteNode },
      draggable: isEditMode,
    })));
  }, [isEditMode, handleDeleteNode]);

  // --- POSITION PERSISTENCE: save positions on drag ---
  const savePositions = useCallback((updatedNodes: Node[]) => {
    const positions: Record<string, { x: number; y: number }> = {};
    updatedNodes.forEach((n) => { positions[n.id] = n.position; });
    savedPositionsRef.current = positions; // keep ref in sync
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ positions }));
  }, []);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        // Persist positions on drag end
        const hasDrag = changes.some((c) => c.type === 'position' && (c as any).dragging === false);
        if (hasDrag) {
          setIsSaving(true);
          if (saveTimeout.current) clearTimeout(saveTimeout.current);
          saveTimeout.current = setTimeout(() => {
            savePositions(next);
            setIsSaving(false);
          }, 300);
        }
        return next;
      });
    },
    [savePositions]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []
  );

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      const targetMilestone = milestones.find(m => m.id === params.target);
      if (targetMilestone && onUpdateMilestone) {
        const newParents = Array.from(new Set([...(targetMilestone.parentIds || []), params.source])) as string[];
        onUpdateMilestone(params.target || '', { parentIds: newParents });
      }
      setEdges((eds) => addEdge({ ...params, style: { stroke: '#8B6914', strokeWidth: 2.5 } }, eds));
    }
    , [milestones, onUpdateMilestone]
  );

  // Delete edge on double click in edit mode
  const onEdgeDoubleClick = useCallback((_: any, edge: Edge) => {
    if (isEditMode) {
        const targetMilestone = milestones.find(m => m.id === edge.target);
        if (targetMilestone && onUpdateMilestone) {
            const newParents = (targetMilestone.parentIds || []).filter((id: string) => id !== edge.source);
            onUpdateMilestone(edge.target, { parentIds: newParents });
        }
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    }
  }, [isEditMode, milestones, onUpdateMilestone]);

  // Fix: inline all DB logic directly so no stale-closure issues
  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      // 1. Update visual state
      setEdges((els) => reconnectEdge(oldEdge, newConnection, els));

      if (!onUpdateMilestone) return;

      // 2. Update backend — target changed (arrowhead dragged to new node)
      if (oldEdge.target !== newConnection.target) {
        // Remove source from old target's parentIds
        const oldTarget = milestones.find(m => m.id === oldEdge.target);
        if (oldTarget) {
          const newParents = (oldTarget.parentIds || []).filter((id: string) => id !== oldEdge.source);
          onUpdateMilestone(oldEdge.target, { parentIds: newParents }).catch((e: any) =>
            console.error('Failed to remove old parent link', e)
          );
        }
        // Add source to new target's parentIds
        const newTarget = milestones.find(m => m.id === newConnection.target);
        if (newTarget && newConnection.target) {
          const newParents = Array.from(
            new Set([...(newTarget.parentIds || []), newConnection.source])
          ) as string[];
          onUpdateMilestone(newConnection.target, { parentIds: newParents }).catch((e: any) =>
            console.error('Failed to add new parent link', e)
          );
        }
      }
      // 3. Update backend — source changed (tail dragged to new node)
      else if (oldEdge.source !== newConnection.source) {
        const target = milestones.find(m => m.id === oldEdge.target);
        if (target) {
          const newParents = (target.parentIds || []).map((id: string) =>
            id === oldEdge.source ? newConnection.source : id
          ) as string[];
          onUpdateMilestone(oldEdge.target, { parentIds: newParents }).catch((e: any) =>
            console.error('Failed to swap parent link', e)
          );
        }
      }
    },
    [milestones, onUpdateMilestone]
  );


  const predictiveETA = useMemo(() => {
    return calculatePredictiveETA(milestones);
  }, [milestones]);

  const nextNodeTitle = useMemo(() => {
    const next = milestones.find((m: any) => m.status !== 'COMPLETED');
    return next ? next.title : undefined;
  }, [milestones]);

  // For the "Add Node" button — pick the first milestone ID
  const firstMilestoneId = milestones[0]?.id || '';

  return (
    <div className="corkboard-canvas">
      <HUD
        etaMetrics={predictiveETA} nextNodeTitle={nextNodeTitle}
        isEditMode={isEditMode} onToggleEdit={() => setIsEditMode(!isEditMode)}
        isSaving={isSaving}
        totalSkills={totalSkills} completedSkills={completedSkills} deadlineDays={deadlineDays}
      />

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={isEditMode}
        nodesConnectable={isEditMode}
        edgesReconnectable={isEditMode}
        elementsSelectable={isEditMode}
        edgesFocusable={isEditMode}
        connectionMode={ConnectionMode.Loose}
        connectionLineStyle={{ stroke: '#00f2ea', strokeWidth: 3 }}
        snapToGrid={true}
        snapGrid={[20, 20]}
        style={{ zIndex: 2 }}
      >
        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Add node button — only in edit mode */}
      {isEditMode && (
        <button
          className="add-node-btn"
          onClick={() => {
            setAddTitle('');
            setAddDetail('');
            setAddModal({ milestoneId: firstMilestoneId || 'new' });
          }}
        >
          <Plus size={16} /> Add New Milestone
        </button>
      )}

      {/* Edit-mode edge hints */}
      {isEditMode && (
        <div style={{
          position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {[
            { icon: '⊕', text: 'Drag ● → ● to link nodes' },
            { icon: '↔', text: 'Drag edge endpoint to reconnect' },
            { icon: '✕', text: 'Double-click edge to delete' },
          ].map((hint) => (
            <span
              key={hint.text}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 20,
                background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(0,242,234,0.25)',
                backdropFilter: 'blur(6px)',
                fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600,
                color: 'rgba(0,242,234,0.8)', letterSpacing: '0.3px',
              }}
            >
              <span style={{ fontSize: 12, color: '#00f2ea' }}>{hint.icon}</span>
              {hint.text}
            </span>
          ))}
        </div>
      )}

      {/* === CONFIRM POPUP (Architecture mode) === */}
      <AnimatePresence>
        {confirmNode && (
          <motion.div className="confirm-popup-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmNode(null)}>
            <motion.div className="confirm-popup" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h3>Ready to prove it?</h3>
              <p>
                You're about to take the assessment for <strong>"{confirmNode.title}"</strong>. 
                Are you ready to test your understanding of this skill?
              </p>
              <div className="confirm-popup-actions">
                <button className="confirm-popup-btn confirm-popup-btn-no" onClick={() => setConfirmNode(null)}>Not Yet</button>
                <button className="confirm-popup-btn confirm-popup-btn-yes" onClick={handleConfirmYes}>Take Assessment</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === EDIT MODAL (Edit mode double-click) === */}
      <AnimatePresence>
        {editModal && (
          <motion.div className="edit-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditModal(null)}>
            <motion.div className="edit-modal" style={{ width: 400, maxWidth: '90%' }} initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: 16 }}>Edit Node</h3>
              <label>Title</label>
              <input value={editModal.title} onChange={(e) => setEditModal({ ...editModal, title: e.target.value })} autoFocus />
              <label>Detail / Target State</label>
              <textarea value={editModal.detail} onChange={(e) => setEditModal({ ...editModal, detail: e.target.value })} rows={2} style={{ resize: 'none' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 }}>
                <label style={{ margin: 0 }}>Difficulty</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEditModal({ ...editModal, difficulty: star })}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                        color: star <= editModal.difficulty ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)',
                        fontSize: '22px', transition: 'color 0.2s'
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <label>Status</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {['PENDING', 'IN_PROGRESS', 'COMPLETED', 'REVISION_REQUIRED', 'FAILED'].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setEditModal({ ...editModal, status: st })}
                    style={{
                      padding: '6px 12px', borderRadius: '12px', fontSize: '10px', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.05em',
                      border: editModal.status === st ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                      background: editModal.status === st ? 'rgba(0, 242, 234, 0.1)' : 'transparent',
                      color: editModal.status === st ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="edit-modal-actions">
                <button className="edit-modal-btn edit-modal-btn-delete" onClick={handleDeleteFromModal}>Delete</button>
                <div style={{ flex: 1 }}></div>
                <button className="edit-modal-btn edit-modal-btn-cancel" onClick={() => setEditModal(null)}>Cancel</button>
                <button className="edit-modal-btn edit-modal-btn-save" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === ADD NODE MODAL === */}
      <AnimatePresence>
        {addModal && (
          <motion.div className="edit-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAddModal(null)}>
            <motion.div className="edit-modal" initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()}>
              <h3>Add New Node</h3>
              <label>Title</label>
              <input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} autoFocus placeholder="Milestone name..." />
              <label>Detail / Target State</label>
              <textarea value={addDetail} onChange={(e) => setAddDetail(e.target.value)} rows={2} placeholder="What should the learner achieve?" />
              <div className="edit-modal-actions">
                <button className="edit-modal-btn edit-modal-btn-cancel" onClick={() => setAddModal(null)}>Cancel</button>
                <button className="edit-modal-btn edit-modal-btn-save" onClick={handleAddNode} disabled={!addTitle.trim() || isSaving}>
                  {isSaving ? 'Adding...' : 'Add Node'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === FAILURE MODAL === */}
      <AnimatePresence>
        {failedNode && (
          <motion.div className="failure-modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setFailedNode(null)}>
            <motion.div className="failure-modal" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <h3>Not quite there yet...</h3>
              <p><strong>"{failedNode.title}"</strong> didn't pass this time. You can continue practicing or move forward and come back later.</p>
              <div className="failure-modal-actions">
                <button className="failure-modal-btn failure-modal-btn-retry" onClick={handleRetry}>
                  <RotateCcw size={16} /> Continue Preparing & Retry
                </button>
                <button className="failure-modal-btn failure-modal-btn-skip" onClick={handleSkipToNext}>
                  <SkipForward size={16} />
                  <span>Skip to Next<br /><span className="skip-sublabel">(pushes to Revision Required)</span></span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RoadmapGraph: React.FC<RoadmapGraphProps> = (props) => {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 768);
  // Mobile edit mode state — must be at top level (Rules of Hooks)
  const [mobileEditMode, setMobileEditMode] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Mobile: render the beautiful touchable card timeline
  if (isMobile) {
    return (
      <MobileRoadmapView
        milestones={props.milestones}
        isEditMode={mobileEditMode}
        isSaving={false}
        onToggleEdit={() => setMobileEditMode(e => !e)}
        onCompleteMilestone={props.onCompleteMilestone || (() => {})}
        onUpdateMilestone={props.onUpdateMilestone || (async () => {})}
        onDeleteMilestone={props.onDeleteMilestone || (async () => {})}
        onAddMilestone={props.onAddMilestone || (async () => {})}
      />
    );
  }

  // Desktop: full React Flow canvas
  return (
    <ReactFlowProvider>
      <RoadmapGraphContent {...props} />
    </ReactFlowProvider>
  );
};

export default RoadmapGraph;
