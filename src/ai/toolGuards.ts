// src/ai/toolGuards.ts
// ─────────────────────────────────────────────────────────────────────────────
// Decides how the agent loop is allowed to use each tool.
//
// READ tools run immediately and their result is fed straight back to the model.
// WRITE tools are intercepted before execution: the loop parks the call in an
// ActionSession, asks the user, and only runs it once they confirm.
//
// This is the single place that policy lives — the model never gets to decide
// whether a mutation is safe.
// ─────────────────────────────────────────────────────────────────────────────

/** Tools that only read user data. Safe to auto-execute. */
export const READ_ONLY_TOOLS = new Set<string>([
    'searchTasks',
    'listTasks',
    'getTask',
    'searchDreams',
    'listDreams',
    'getDream',
    'getDashboard',
    'listSprints',
    'getSprint',
    'getPreferences',
    'listNotifications',
    'getRoadmap',
    'listRoadmaps',
]);

/** Tools that mutate state and therefore require explicit user confirmation. */
export const WRITE_TOOLS = new Set<string>([
    'createTask',
    'updateTask',
    'updateTaskProgress',
    'completeTask',
    'blockTask',
    'archiveTask',
    'updateCheckpoint',
    'updateCheckpointProgress',
    'deleteCheckpoint',
    'syncDreamState',
    'updateDream',
    'completeDream',
    'failDream',
    'archiveDream',
    'generateRoadmap',
    'activateRoadmap',
    'updatePreferences',
    'updateProfile',
]);

/**
 * Tools whose effect cannot be undone by the user through the UI. These get a
 * scarier confirmation prompt, and are never auto-approved by a vague "yes".
 */
export const DESTRUCTIVE_TOOLS = new Set<string>([
    'archiveTask',
    'deleteCheckpoint',
    'archiveDream',
    'failDream',
]);

export function isWriteTool(name: string): boolean {
    return WRITE_TOOLS.has(name);
}

export function isReadTool(name: string): boolean {
    return READ_ONLY_TOOLS.has(name);
}

export function isDestructiveTool(name: string): boolean {
    return DESTRUCTIVE_TOOLS.has(name);
}

/**
 * Human-readable label used in the confirmation bubble, so the user never sees
 * a raw function name.
 */
export const TOOL_LABELS: Record<string, string> = {
    searchTasks: 'look through your tasks',
    listTasks: 'list your tasks',
    getTask: 'open a task',
    searchDreams: 'search your dreams',
    listDreams: 'list your dreams',
    getDream: 'open a dream',
    createTask: 'create a task',
    updateTask: 'update a task',
    updateTaskProgress: 'update task progress',
    completeTask: 'mark a task complete',
    blockTask: 'mark a task blocked',
    archiveTask: 'delete a task',
    updateCheckpoint: 'update a checkpoint',
    updateCheckpointProgress: 'log progress on a checkpoint',
    deleteCheckpoint: 'delete a checkpoint',
    syncDreamState: 'create a dream',
    updateDream: 'update a dream',
    completeDream: 'mark a dream complete',
    failDream: 'mark a dream as failed',
    archiveDream: 'delete a dream',
    getDashboard: 'check your dashboard',
    listSprints: 'review your sprint history',
    getSprint: 'check a specific week',
    getPreferences: 'read your preferences',
    updatePreferences: 'update your preferences',
    updateProfile: 'update your profile',
    listNotifications: 'check your notifications',
    generateRoadmap: 'generate a roadmap',
    activateRoadmap: 'activate a roadmap',
    getRoadmap: 'open a roadmap',
    listRoadmaps: 'list your roadmaps',
};

export function toolLabel(name: string): string {
    return TOOL_LABELS[name] ?? name;
}

/**
 * Past-tense form of the label, for sentences like "Done — I've ___".
 * `toolLabel` is written to read naturally after "about to", which is the
 * common case; this is the rarer retrospective one.
 */
const TOOL_LABELS_PAST: Record<string, string> = {
    searchTasks: 'checked your tasks',
    listTasks: 'gone through your tasks',
    getTask: 'opened that task',
    searchDreams: 'searched your dreams',
    listDreams: 'gone through your dreams',
    getDream: 'opened that dream',
    createTask: 'created that task',
    updateTask: 'updated that task',
    updateTaskProgress: 'updated the progress',
    completeTask: 'marked that task complete',
    blockTask: 'marked that task blocked',
    archiveTask: 'deleted that task',
    updateCheckpoint: 'updated that checkpoint',
    updateCheckpointProgress: 'logged the checkpoint progress',
    deleteCheckpoint: 'deleted that checkpoint',
    syncDreamState: 'created that dream',
    updateDream: 'updated that dream',
    completeDream: 'marked that dream complete',
    failDream: 'marked that dream failed',
    archiveDream: 'deleted that dream',
    getDashboard: 'checked your dashboard',
    listSprints: 'reviewed your sprint history',
    getSprint: 'checked that week',
    getPreferences: 'read your preferences',
    updatePreferences: 'updated your preferences',
    updateProfile: 'updated your profile',
    listNotifications: 'checked your notifications',
    generateRoadmap: 'generated that roadmap',
    activateRoadmap: 'activated that roadmap',
    getRoadmap: 'opened that roadmap',
    listRoadmaps: 'gone through your roadmaps',
};

export function toolLabelPast(name: string): string {
    return TOOL_LABELS_PAST[name] ?? `handled ${name}`;
}
