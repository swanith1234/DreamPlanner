import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  CheckCircle2, 
  Circle, 
  Zap,
  Target,
  Trophy,
  Loader2,
  Edit3,
  Layers
} from 'lucide-react';

// --- Types ---
type Status = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REVISION_REQUIRED';
type NodeType = 'DREAM' | 'MILESTONE' | 'SKILL' | 'TASK';

interface BaseNode {
  id: string;
  title: string;
  type: NodeType;
  status: Status;
  targetUserState?: string;
}

interface TechTreeNode extends BaseNode {
  children?: string[]; // IDs
  parentId?: string;
}

interface TechTreeProps {
  dreamTitle: string;
  milestones: any[];
  onCompleteSkill: (skillId: string) => void;
  onUpdateStatus: (nodeId: string, type: NodeType, status: Status) => void;
  onCustomize: (nodeId: string, type: NodeType) => void;
  isProcessing: boolean;
}

// --- Icons Mapping ---
const typeIcons: Record<string, React.ElementType> = {
  DREAM: Target,
  MILESTONE: Trophy,
  SKILL: Zap,
  TASK: CheckCircle2,
};

// --- Sub-components ---

const NodeCard: React.FC<{
  node: TechTreeNode;
  selected: boolean;
  onClick: () => void;
  innerRef: (el: HTMLDivElement | null) => void;
}> = ({ node, selected, onClick, innerRef }) => {
  const Icon = typeIcons[node.type] ?? Circle;
  
  const isCompleted = node.status === 'COMPLETED';
  const isActive = node.status === 'IN_PROGRESS';
  const isPending = node.status === 'PENDING' || node.status === 'FAILED' || node.status === 'REVISION_REQUIRED';

  return (
    <motion.div
      ref={innerRef}
      whileHover={{ scale: 1.04, y: -5, rotateX: 5 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`
        relative rounded-2xl px-5 py-4 text-left transition-all duration-300 cursor-pointer select-none
        border-2 min-w-[220px] max-w-[280px]
        ${isActive ? 'node-active bg-cyan-500/10 text-white' : ''}
        ${isCompleted ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-50' : 'glass-panel'}
        ${isPending ? 'opacity-40 text-slate-400 grayscale-[0.3]' : ''}
        ${selected ? 'ring-2 ring-white ring-offset-4 ring-offset-[#020617]' : ''}
      `}
      style={{
        transformStyle: 'preserve-3d',
        boxShadow: isActive ? '0 20px 40px -10px rgba(34, 211, 238, 0.4)' : '0 10px 20px -5px rgba(0, 0, 0, 0.3)'
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-lg ${isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-slate-400'}`}>
          <Icon className="w-5 h-5 shrink-0" />
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-50">
            {node.type}
          </span>
          <div className="text-[10px] font-bold text-cyan-400/80">
            {isActive ? 'SYNCHRONIZING' : isCompleted ? 'VERIFIED' : 'QUEUED'}
          </div>
        </div>
        <div className="ml-auto">
          {isCompleted ? (
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          ) : isActive ? (
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/50">
               <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            </div>
          ) : (
            <Circle className="w-5 h-5 opacity-20" />
          )}
        </div>
      </div>
      <h3 className="text-base font-bold leading-tight mb-2 text-white/90">
        {node.title}
      </h3>
      
      {isActive && (
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-3">
          <motion.div 
            className="h-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      )}
    </motion.div>
  );
};

const SidePanel = ({ 
  node, 
  onClose, 
  onComplete, 
  onUpdateStatus,
  onCustomize,
  isProcessing 
}: { 
  node: TechTreeNode; 
  onClose: () => void; 
  onComplete: (id: string) => void; 
  onUpdateStatus: (id: string, type: NodeType, status: Status) => void;
  onCustomize: (id: string, type: NodeType) => void;
  isProcessing: boolean;
}) => {
  const statuses: Status[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed top-0 right-0 h-full w-[400px] z-50 p-8 backdrop-blur-3xl bg-[#020617]/95 border-l border-white/10 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] overflow-y-auto"
    >
      <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all">
        <X size={20} />
      </button>

      <div className="mt-8">
        <div className="flex flex-col gap-3 mb-8">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400/50">Progression State</span>
          <div className="grid grid-cols-3 gap-2">
            {statuses.map(s => {
              const active = node.status === s;
              return (
                <button
                  key={s}
                  onClick={() => onUpdateStatus(node.id, node.type, s)}
                  className={`
                    px-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border-2
                    ${active 
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.2)]' 
                      : 'bg-white/[0.02] border-white/5 text-slate-500 hover:border-white/20 hover:text-slate-300'}
                  `}
                >
                  {s.replace('_', ' ')}
                </button>
              );
            })}
          </div>
        </div>

        <h2 className="text-3xl font-bold text-white mb-2 leading-tight tracking-tight">
          {node.title}
        </h2>
        
        <div className="flex items-center gap-2 text-slate-400 mb-8 pb-4 border-b border-white/5">
          <Layers size={14} className="opacity-50" />
          <span className="text-[10px] uppercase font-bold tracking-[0.2em]">{node.type}</span>
        </div>

        <section className="mb-10 p-6 rounded-2xl bg-white/[0.02] border border-white/5">
          <h4 className="flex items-center gap-2 text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
            <Zap size={12} className="text-cyan-400" />
            Architectural Intent
          </h4>
          <p className="text-slate-300 leading-relaxed italic font-medium">
            "{node.targetUserState || 'Demonstrate mastery of the core concepts and architectural patterns required for this milestone.'}"
          </p>
        </section>

        <div className="flex flex-col gap-4">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={isProcessing || node.status === 'COMPLETED'}
            onClick={() => onComplete(node.id)}
            className={`
              w-full h-14 flex items-center justify-center gap-3 font-black uppercase tracking-[0.1em] text-xs rounded-xl transition-all
              ${node.status === 'COMPLETED' 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default' 
                : 'bg-[var(--color-accent)] hover:brightness-110 text-[#050510] shadow-[0_8px_30px_rgba(0,242,234,0.3)]'}
              ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={18} />}
            {node.status === 'COMPLETED' ? 'Mastery Verified' : 'Verify Achievement'}
          </motion.button>
          
          <button 
            onClick={() => onCustomize(node.id, node.type)}
            className="w-full h-12 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all border border-white/5"
          >
            <Edit3 size={14} />
            Customize Node
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// --- Main Tree Component ---

export const TechTree: React.FC<TechTreeProps> = ({ 
  dreamTitle, 
  milestones, 
  onCompleteSkill, 
  onUpdateStatus,
  onCustomize,
  isProcessing 
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number; w: number; h: number }>>(new Map());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Flatten logic
  const { flatNodes, levels } = useMemo(() => {
    const flat: Record<string, TechTreeNode> = {};
    const lvl_dream: TechTreeNode[] = [];
    const lvl_milestones: TechTreeNode[] = [];
    const lvl_skills: TechTreeNode[] = [];
    
    // Root Dream
    const root: TechTreeNode = {
      id: 'root',
      title: dreamTitle,
      type: 'DREAM',
      status: 'IN_PROGRESS',
      children: milestones.map(m => m.id)
    };
    flat['root'] = root;
    lvl_dream.push(root);

    milestones.forEach(m => {
      const msNode: TechTreeNode = {
        id: m.id,
        parentId: 'root',
        title: m.title,
        type: 'MILESTONE',
        status: m.status as Status,
        targetUserState: m.targetUserState,
        children: m.skills?.map((s: any) => s.id) || []
      };
      flat[m.id] = msNode;
      lvl_milestones.push(msNode);

      m.skills?.forEach((s: any) => {
        const skNode: TechTreeNode = {
          id: s.id,
          parentId: m.id,
          title: s.title,
          type: 'SKILL',
          status: s.status as Status,
          targetUserState: s.targetUserState,
          children: []
        };
        flat[s.id] = skNode;
        lvl_skills.push(skNode);
      });
    });

    return { flatNodes: flat, levels: [
      { type: 'DREAM', nodes: lvl_dream },
      { type: 'MILESTONE', nodes: lvl_milestones },
      { type: 'SKILL', nodes: lvl_skills }
    ]};
  }, [dreamTitle, milestones]);

  // Measurement logic
  const measureNodes = useCallback(() => {
    if (!containerRef.current) return;
    const cRect = containerRef.current.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    
    nodeRefs.current.forEach((el, id) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      next.set(id, {
        x: r.left - cRect.left + containerRef.current!.scrollLeft,
        y: r.top - cRect.top + containerRef.current!.scrollTop,
        w: r.width,
        h: r.height,
      });
    });
    setPositions(next);
  }, []);

  useEffect(() => {
    const t = setTimeout(measureNodes, 200); // Wait for initial render
    window.addEventListener('resize', measureNodes);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measureNodes);
    };
  }, [measureNodes, milestones]);

  const setNodeRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  const selectedNode = selectedId ? flatNodes[selectedId] : null;

  return (
    <div className="relative w-full min-h-[90vh] bg-[#020617] overflow-auto grid-blueprint rounded-3xl border border-white/5 shadow-2xl perspective-container">
      <div 
        ref={containerRef} 
        className="relative min-w-[1400px] flex flex-col items-center py-40 gap-64 blueprint-surface"
      >
        {/* SVG Connections Layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
          <defs>
            <linearGradient id="line-active" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="line-pending" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#334155" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#334155" stopOpacity="0.3" />
            </linearGradient>
            <filter id="glow">
               <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
               <feMerge>
                   <feMergeNode in="coloredBlur"/>
                   <feMergeNode in="SourceGraphic"/>
               </feMerge>
            </filter>
          </defs>

          {Object.values(flatNodes).map(node => {
            if (!node.parentId) return null;
            const parent = positions.get(node.parentId);
            const child = positions.get(node.id);
            if (!parent || !child) return null;

            const x1 = parent.x + parent.w / 2;
            const y1 = parent.y + parent.h;
            const x2 = child.x + child.w / 2;
            const y2 = child.y;

            const midY = (y1 + y2) / 2;
            const isActive = node.status === 'IN_PROGRESS' || node.status === 'COMPLETED';

            return (
              <motion.path
                key={`${node.parentId}-${node.id}`}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none"
                stroke={isActive ? 'url(#line-active)' : 'url(#line-pending)'}
                strokeWidth={isActive ? 2.5 : 1.5}
                strokeDasharray={!isActive ? '8,6' : 'none'}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                filter={isActive ? "url(#glow)" : "none"}
              />
            );
          })}
        </svg>

        {/* Nodes Grid */}
        <div className="flex flex-col gap-64 w-full">
          {levels.map((level, lvlIdx) => (
            <div key={level.type} className="relative z-10 w-full">
              <p className="text-[11px] font-black uppercase tracking-[0.5em] text-cyan-400/30 mb-14 text-center">
                {level.type}S
              </p>
              <div className="flex flex-wrap items-start justify-center gap-24 px-32">
                {level.nodes.map((node, i) => (
                  <motion.div
                    key={node.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: lvlIdx * 0.2 + i * 0.1 }}
                  >
                    <NodeCard
                      innerRef={(el) => setNodeRef(node.id, el)}
                      node={node}
                      selected={selectedId === node.id}
                      onClick={() => setSelectedId(selectedId === node.id ? null : node.id)}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedId && selectedNode && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="fixed inset-0 bg-[#050510]/60 backdrop-blur-md z-40"
            />
            <SidePanel 
              node={selectedNode} 
              onClose={() => setSelectedId(null)} 
              onComplete={onCompleteSkill}
              onUpdateStatus={onUpdateStatus}
              onCustomize={onCustomize}
              isProcessing={isProcessing}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TechTree;
