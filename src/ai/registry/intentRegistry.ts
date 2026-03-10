// src/ai/registry/intentRegistry.ts
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for all AI intents.
// intentDetector, parameterExtractor, and apiAdapter all import from here.
// DO NOT define field requirements anywhere else.
// ─────────────────────────────────────────────────────────────────────────────

export const MODES = {
    ACTION: 'ACTION', // writes data — may require confirmation
    QUERY: 'QUERY',   // reads data — no confirmation
    CHAT: 'CHAT',     // pure conversation — no API call
} as const;

export type Mode = (typeof MODES)[keyof typeof MODES];

export interface IntentDefinition {
    mode: Mode;
    requiresConfirmation: boolean;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    endpoint?: string;
    required: string[];
    optional: string[];
    note?: string;
}

export const INTENT_REGISTRY: Record<string, IntentDefinition> = {

    // ══════════════════════════════════════
    // TASK
    // ══════════════════════════════════════

    CREATE_TASK: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'POST', endpoint: '/api/tasks',
        // dreamId and priority are REQUIRED by the backend — never treat as optional
        required: ['title', 'deadline', 'dreamId', 'priority'],
        //          string   ISO date   string(id)  number 1–5
        optional: ['description', 'startDate', 'estimatedDuration', 'checkpoints'],
        //                          ISO date     minutes (int)        CheckpointDto[]
        note: 'If (deadline - now) > 24hrs, MUST collect and validate checkpoints before executing.',
    },

    UPDATE_TASK: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'PUT', endpoint: '/api/tasks/:taskId',
        required: ['taskId'],
        optional: ['title', 'description', 'deadline', 'priority', 'startDate', 'estimatedDuration', 'status'],
    },

    COMPLETE_TASK: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'POST', endpoint: '/api/tasks/:taskId/complete',
        required: ['taskId'], optional: [],
    },

    BLOCK_TASK: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'POST', endpoint: '/api/tasks/:taskId/block',
        required: ['taskId'], optional: [],
    },

    ARCHIVE_TASK: {
        mode: MODES.ACTION, requiresConfirmation: true, // destructive
        method: 'DELETE', endpoint: '/api/tasks/:taskId',
        required: ['taskId'], optional: [],
    },

    UPDATE_TASK_PROGRESS: {
        mode: MODES.ACTION, requiresConfirmation: false,
        method: 'POST', endpoint: '/api/tasks/:taskId/progress',
        required: ['taskId', 'value'], // value: 0–100
        optional: [],
    },

    GET_TASK: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/tasks/:taskId',
        required: ['taskId'], optional: [],
    },

    LIST_TASKS: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/tasks',
        required: [],
        optional: ['dreamId', 'status'],
        // status: PENDING | IN_PROGRESS | COMPLETED | BLOCKED | ARCHIVED
    },

    // ══════════════════════════════════════
    // CHECKPOINT
    // ══════════════════════════════════════

    UPDATE_CHECKPOINT: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'PUT', endpoint: '/api/tasks/:taskId/checkpoints/:checkpointId',
        required: ['taskId', 'checkpointId'],
        optional: ['title', 'targetDate'], // targetDate: YYYY-MM-DD
    },

    UPDATE_CHECKPOINT_PROGRESS: {
        mode: MODES.ACTION, requiresConfirmation: false,
        method: 'POST', endpoint: '/api/tasks/:taskId/checkpoints/:checkpointId/progress',
        required: ['taskId', 'checkpointId', 'delta'], // delta: positive int 1–100
        optional: ['localDate'], // YYYY-MM-DD from browser local timezone
    },

    DELETE_CHECKPOINT: {
        mode: MODES.ACTION, requiresConfirmation: true, // destructive
        method: 'DELETE', endpoint: '/api/tasks/:taskId/checkpoints/:checkpointId',
        required: ['taskId', 'checkpointId'], optional: [],
        note: 'Route was added to task.route.ts as part of this AI integration.',
    },

    // ══════════════════════════════════════
    // DREAM — 3-step creation flow
    // ══════════════════════════════════════

    CREATE_DREAM_DRAFT: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'POST', endpoint: '/api/dreams',
        // motivationStatement is mandatory in the AI flow (even though DB allows null)
        required: ['title', 'description', 'deadline', 'impactScore', 'motivationStatement'],
        //          string   string          ISO date    1–10           string
        optional: [],
    },

    VALIDATE_DREAM: {
        mode: MODES.ACTION, requiresConfirmation: false, // read-only LLM validation
        method: 'POST', endpoint: '/api/dreams/:dreamId/validate',
        required: ['dreamId'], optional: [],
    },

    CONFIRM_DREAM: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'POST', endpoint: '/api/dreams/:dreamId/confirm',
        // checkpoints[]: { title*, orderIndex* | description?, expectedEffort?, miniDeadline? }
        required: ['dreamId', 'checkpoints'],
        optional: [],
    },

    UPDATE_DREAM: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'PUT', endpoint: '/api/dreams/:dreamId',
        required: ['dreamId'],
        optional: ['title', 'description', 'deadline', 'impactScore', 'motivationStatement'],
    },

    ARCHIVE_DREAM: {
        mode: MODES.ACTION, requiresConfirmation: true, // destructive
        method: 'DELETE', endpoint: '/api/dreams/:dreamId',
        required: ['dreamId'], optional: [],
    },

    COMPLETE_DREAM: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'POST', endpoint: '/api/dreams/:dreamId/complete',
        required: ['dreamId'], optional: [],
    },

    FAIL_DREAM: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'POST', endpoint: '/api/dreams/:dreamId/fail',
        required: ['dreamId'], optional: [],
    },

    GET_DREAM: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/dreams/:dreamId',
        required: ['dreamId'], optional: [],
    },

    LIST_DREAMS: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/dreams',
        required: [],
        optional: ['status'], // DRAFT | ACTIVE | COMPLETED | FAILED | ARCHIVED
    },

    // ══════════════════════════════════════
    // ANALYTICS
    // ══════════════════════════════════════

    GET_DASHBOARD: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/analytics/dashboard',
        required: [], optional: [],
    },

    LIST_SPRINTS: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/analytics/sprints',
        required: [], optional: [],
    },

    GET_SPRINT: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/analytics/sprint/:weekStart',
        required: ['weekStart'], // YYYY-MM-DD
        optional: [],
    },

    // ══════════════════════════════════════
    // USER — Profile & Preferences
    // ══════════════════════════════════════

    GET_PREFERENCES: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/users/preferences',
        required: [], optional: [],
    },

    UPDATE_PREFERENCES: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'PUT', endpoint: '/api/users/preferences',
        // All 4 are required by the backend upsert (no partial update)
        required: ['motivationTone', 'notificationFrequency', 'sleepStart', 'sleepEnd'],
        // motivationTone: HARSH|POSITIVE|OPTIMISTIC|FEAR|LOGICAL|NEUTRAL
        // notificationFrequency: minutes (integer)
        // sleepStart / sleepEnd: "HH:MM"
        optional: ['quietHours'], // [{ start: "HH:MM", end: "HH:MM" }]
    },

    UPDATE_PROFILE: {
        mode: MODES.ACTION, requiresConfirmation: true,
        method: 'PUT', endpoint: '/api/users/profile',
        required: ['timezone'], // IANA timezone e.g. "Asia/Kolkata"
        optional: [],
    },

    // ══════════════════════════════════════
    // NOTIFICATIONS
    // ══════════════════════════════════════

    LIST_NOTIFICATIONS: {
        mode: MODES.QUERY, requiresConfirmation: false,
        method: 'GET', endpoint: '/api/notifications',
        required: [], optional: [],
    },

    // Push subscriptions — rarely triggered via chat but must be registered
    // to prevent the intent detector from misclassifying push-related messages
    PUSH_SUBSCRIBE: {
        mode: MODES.ACTION, requiresConfirmation: false,
        method: 'POST', endpoint: '/api/notifications/subscribe',
        required: ['endpoint', 'p256dh', 'auth'], optional: [],
    },

    PUSH_UNSUBSCRIBE: {
        mode: MODES.ACTION, requiresConfirmation: false,
        method: 'POST', endpoint: '/api/notifications/unsubscribe',
        required: ['endpoint'], optional: [],
    },

    // ══════════════════════════════════════
    // SYSTEM / FLOW CONTROL
    // These intents are NOT backed by REST endpoints.
    // They let the orchestrator handle conversational flow via LLM classification
    // instead of brittle keyword arrays.
    // ══════════════════════════════════════

    CANCEL_DRAFT: {
        mode: MODES.ACTION, requiresConfirmation: false,
        required: [], optional: [],
        note: 'User wants to abort / cancel the current in-progress draft operation.',
    },

    CONFIRM_YES: {
        mode: MODES.ACTION, requiresConfirmation: false,
        required: [], optional: [],
        note: 'User is confirming / saying yes to the current prompt (confirmation gate or abort question).',
    },

    CONFIRM_NO: {
        mode: MODES.ACTION, requiresConfirmation: false,
        required: [], optional: [],
        note: 'User is declining / saying no to the current prompt.',
    },

    SKIP_FIELD: {
        mode: MODES.ACTION, requiresConfirmation: false,
        required: [], optional: [],
        note: 'User wants to skip or leave blank the field currently being collected.',
    },

    // ══════════════════════════════════════
    // PURE CHAT
    // ══════════════════════════════════════

    GENERAL_CHAT: {
        mode: MODES.CHAT, requiresConfirmation: false,
        required: [], optional: [],
    },
};

// Derive valid intent names as a type-safe union for the intent detector
export const VALID_INTENTS = Object.keys(INTENT_REGISTRY) as (keyof typeof INTENT_REGISTRY)[];
export type IntentName = (typeof VALID_INTENTS)[number];
