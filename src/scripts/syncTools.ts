import { TOOLS } from '../ai/tools';
import { registerTool } from '../services/toolService';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// buildSemanticFingerprint
//
// Why: MiniLM embeds SHORT strings poorly when two tools share similar wording.
// Embedding only `tool.function.description` causes listDreams and searchDreams
// to land within 0.01 cosine distance of each other → always AMBIGUOUS.
//
// Fix: Build a rich, distinctive sentence per tool that includes:
//   1. The tool name (unique token)
//   2. The human description
//   3. Every parameter name + its description (distinctive vocabulary)
//   4. The required fields (signals "this tool needs X")
//   5. Hand-crafted trigger phrases (the natural-language queries a user would type)
//
// This spreads tool vectors far apart in the 384-dim MiniLM space.
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGER_PHRASES: Record<string, string> = {
  // ── Tasks — read ───────────────────────────────────────────────────────────
  searchTasks:    'find tasks, search for a task, look up tasks, query tasks by name',
  listTasks:      'list all tasks, show my tasks, show pending tasks, get task list',
  getTask:        'get task details, show task info, open a specific task, task details by id',

  // ── Tasks — write ──────────────────────────────────────────────────────────
  createTask:     'create a task, add a new task, make a task, new task, schedule a task',
  updateTask:     'update task, edit task, change task deadline, modify task, rename task, reschedule task',
  updateTaskProgress: 'set task progress, update progress percentage, mark task 50 percent done',
  completeTask:   'complete task, mark task done, finish task, task completed',
  blockTask:      'block task, mark task blocked, task is stuck, flag task as blocked',
  archiveTask:    'archive task, delete task, remove task, get rid of task',

  // ── Checkpoints — write ────────────────────────────────────────────────────
  updateCheckpoint:         'update checkpoint, edit checkpoint, change checkpoint date, rename checkpoint',
  updateCheckpointProgress: 'update checkpoint progress, add checkpoint delta, log checkpoint activity',
  deleteCheckpoint:         'delete checkpoint, remove checkpoint, drop checkpoint',

  // ── Dreams — read ──────────────────────────────────────────────────────────
  searchDreams:   'search for a dream, find dream by name, look up a specific dream, query dreams by keyword',
  listDreams:     'list all dreams, show my dreams, show active dreams, get dream list, view dreams',
  getDream:       'get dream details, show dream info, open a specific dream, dream details by id',

  // ── Dreams — write ─────────────────────────────────────────────────────────
  syncDreamState: 'create a new dream, add a dream, set up a dream, start a dream, new dream with title domain deadline',
  updateDream:    'update dream, edit dream, change dream deadline, modify dream, update dream motivation',
  completeDream:  'complete dream, mark dream done, finish dream, dream achieved, dream accomplished',
  failDream:      'fail dream, mark dream failed, give up on dream, dream unsuccessful',
  archiveDream:   'archive dream, delete dream, remove dream, get rid of dream',

  // ── Analytics — read ───────────────────────────────────────────────────────
  getDashboard:   'get dashboard, show analytics, discipline score, weekly stats, show progress, how am I doing',
  listSprints:    'list sprints, show weekly sprints, sprint history, past weeks',
  getSprint:      'get sprint, show sprint for week, weekly sprint analytics',

  // ── User ───────────────────────────────────────────────────────────────────
  getPreferences:    'get preferences, show my settings, user preferences, notification settings',
  updatePreferences: 'update preferences, change settings, set motivation tone, update notification frequency',
  updateProfile:     'update profile, change timezone, set my timezone',

  // ── Notifications ──────────────────────────────────────────────────────────
  listNotifications: 'list notifications, show notifications, my reminders, recent alerts',

  // ── Roadmap ────────────────────────────────────────────────────────────────
  generateRoadmap:  'generate roadmap, create roadmap, build roadmap, plan milestones for dream',
  activateRoadmap:  'activate roadmap, start roadmap, enable roadmap',
  getRoadmap:       'get roadmap, show roadmap, view roadmap details',
  listRoadmaps:     'list roadmaps, show roadmaps for dream, all roadmaps',
};

function buildSemanticFingerprint(tool: typeof TOOLS[number]): string {
  const fn = tool.function;
  const props = (fn.parameters as any)?.properties ?? {};
  const required: string[] = (fn.parameters as any)?.required ?? [];

  // 1. Name + description
  const parts: string[] = [
    `Tool: ${fn.name}.`,
    fn.description,
  ];

  // 2. Each parameter name + its description (if available)
  const paramLines = Object.entries(props).map(([key, val]: [string, any]) => {
    const desc = val?.description ? `: ${val.description}` : '';
    return `${key}${desc}`;
  });
  if (paramLines.length > 0) {
    parts.push(`Parameters: ${paramLines.join(', ')}.`);
  }

  // 3. Required fields (critical distinguishing signal)
  if (required.length > 0) {
    parts.push(`Required fields: ${required.join(', ')}.`);
  } else {
    parts.push('No required fields.');
  }

  // 4. Trigger phrases (hand-crafted natural-language queries)
  const triggers = TRIGGER_PHRASES[fn.name];
  if (triggers) {
    parts.push(`Example user queries: ${triggers}.`);
  }

  return parts.join(' ');
}

function getCategory(name: string) {
  const n = name.toLowerCase();
  if (n.includes('task') || n.includes('checkpoint')) return 'TASKS';
  if (n.includes('dream')) return 'DREAMS';
  if (n.includes('roadmap') || n.includes('milestone') || n.includes('skill')) return 'ROADMAP';
  if (['getdashboard', 'listsprints', 'getsprint'].includes(n)) return 'ANALYTICS';
  return 'USER';
}

async function sync() {
  await logger.info('syncTools', 'Starting rich-fingerprint tool sync to DB', {});
  for (const tool of TOOLS) {
    const name = tool.function.name;
    const category = getCategory(name);
    const fingerprint = buildSemanticFingerprint(tool);

    await logger.info('syncTools', `[FINGERPRINT] ${name}`, { fingerprint });
    await registerTool(name, fingerprint, category, tool);
    await logger.info('syncTools', `✅ Synced: ${name}`, {});
  }
  await logger.info('syncTools', 'Tool sync complete — all embeddings updated', {});
  process.exit(0);
}

sync().catch(async (e) => {
  await logger.error('syncTools', 'Error syncing tools', { error: e.message });
  process.exit(1);
});
