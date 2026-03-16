// src/ai/tools.ts
// ─────────────────────────────────────────────────────────────────────────────
// Groq tool schema definitions.
// Descriptions are intentionally concise to minimise token usage per turn.
// All write tools require user confirmation (enforced via system prompt).
// ─────────────────────────────────────────────────────────────────────────────

export const TOOLS = [

    // ════════ TASKS — read ════════

    {
        type: 'function',
        function: {
            name: 'searchTasks',
            description: 'Search tasks by natural language. Use when user references a task ambiguously ("my OS task", "that one"). Returns matching tasks with IDs.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query' },
                    status: { type: ['string', 'null'], description: 'Optional filter: PENDING | IN_PROGRESS | COMPLETED | BLOCKED | ARCHIVED' },
                },
                required: ['query'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'listTasks',
            description: 'Get all tasks. Filter by dreamId or status.',
            parameters: {
                type: 'object',
                properties: {
                    dreamId: { type: ['string', 'null'] },
                    status: { type: ['string', 'null'], description: 'Optional filter: PENDING | IN_PROGRESS | COMPLETED | BLOCKED | ARCHIVED' },
                },
                required: [],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'getTask',
            description: 'Get full details of a specific task including checkpoints.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                },
                required: ['taskId'],
            },
        },
    },

    // ════════ TASKS — write ════════

    {
        type: 'function',
        function: {
            name: 'createTask',
            description: 'Create a new task. Confirm with user before calling.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    deadline: { type: 'string', description: 'YYYY-MM-DD' },
                    dreamId: { type: 'string', description: 'Parent dream UUID' },
                    priority: { type: 'integer', minimum: 1, maximum: 5 },
                    startDate: { type: 'string', description: 'YYYY-MM-DD' },
                    estimatedDuration: { type: 'integer', description: 'Minutes' },
                    checkpoints: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                targetDate: { type: 'string', description: 'YYYY-MM-DD' },
                                orderIndex: { type: 'integer' },
                            },
                            required: ['title', 'targetDate', 'orderIndex'],
                        },
                    },
                },
                required: ['title', 'deadline', 'dreamId', 'priority'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'updateTask',
            description: 'Update task fields. Confirm with user before calling.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    deadline: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
                    priority: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
                    startDate: { type: ['string', 'null'] },
                    estimatedDuration: { type: ['integer', 'null'] },
                    status: { type: ['string', 'null'], description: 'PENDING | IN_PROGRESS | COMPLETED | BLOCKED | ARCHIVED' },
                },
                required: ['taskId'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'updateTaskProgress',
            description: 'Set task progress 0–100. Confirm with user before calling.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                    value: { type: 'integer', minimum: 0, maximum: 100 },
                },
                required: ['taskId', 'value'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'completeTask',
            description: 'Mark task COMPLETED. Confirm with user before calling.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                },
                required: ['taskId'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'blockTask',
            description: 'Mark task BLOCKED. Confirm with user before calling.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                },
                required: ['taskId'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'archiveTask',
            description: 'Archive (delete) a task. Destructive — confirm with user before calling.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                },
                required: ['taskId'],
            },
        },
    },

    // ════════ CHECKPOINTS — write ════════

    {
        type: 'function',
        function: {
            name: 'updateCheckpoint',
            description: 'Update a checkpoint title or target date. Confirm with user.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                    checkpointId: { type: 'string' },
                    title: { type: 'string' },
                    targetDate: { type: 'string', description: 'YYYY-MM-DD' },
                },
                required: ['taskId', 'checkpointId'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'updateCheckpointProgress',
            description: 'Add progress delta (1–100) to a checkpoint. Confirm with user.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                    checkpointId: { type: 'string' },
                    delta: { type: 'integer', minimum: 1, maximum: 100 },
                    localDate: { type: 'string', description: 'YYYY-MM-DD' },
                },
                required: ['taskId', 'checkpointId', 'delta'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'deleteCheckpoint',
            description: 'Delete a checkpoint. Destructive — confirm with user.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: { type: 'string' },
                    checkpointId: { type: 'string' },
                },
                required: ['taskId', 'checkpointId'],
            },
        },
    },

    // ════════ DREAMS — read ════════

    {
        type: 'function',
        function: {
            name: 'listDreams',
            description: 'Get all dreams. Optionally filter by status.',
            parameters: {
                type: 'object',
                properties: {
                    status: { type: ['string', 'null'], description: 'Optional filter: DRAFT | ACTIVE | COMPLETED | FAILED | ARCHIVED' },
                },
                required: [],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'getDream',
            description: 'Get full details of a specific dream.',
            parameters: {
                type: 'object',
                properties: {
                    dreamId: { type: 'string' },
                },
                required: ['dreamId'],
            },
        },
    },

    // ════════ DREAMS — write ════════

    {
        type: 'function',
        function: {
            name: 'createDream',
            description: 'Create a new dream draft. 3-step flow: createDream → validateDream → confirmDream. Confirm with user before calling.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    deadline: { type: 'string', description: 'YYYY-MM-DD' },
                    impactScore: { type: 'integer', minimum: 1, maximum: 10 },
                    motivationStatement: { type: 'string', description: 'The emotional why behind this dream' },
                },
                required: ['title', 'description', 'deadline', 'impactScore', 'motivationStatement'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'validateDream',
            description: 'Run AI validation and get suggested milestone checkpoints for a dream draft. Call this after createDream.',
            parameters: {
                type: 'object',
                properties: {
                    dreamId: { type: 'string' },
                },
                required: ['dreamId'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'confirmDream',
            description: 'Finalize a dream with confirmed checkpoints. Call after validateDream. Confirm with user.',
            parameters: {
                type: 'object',
                properties: {
                    dreamId: { type: 'string' },
                    checkpoints: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                orderIndex: { type: 'integer' },
                                description: { type: 'string' },
                                expectedEffort: { type: 'integer' },
                                miniDeadline: { type: 'string', description: 'YYYY-MM-DD' },
                            },
                            required: ['title', 'orderIndex'],
                        },
                    },
                },
                required: ['dreamId', 'checkpoints'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'updateDream',
            description: 'Update dream fields. Confirm with user.',
            parameters: {
                type: 'object',
                properties: {
                    dreamId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    deadline: { type: 'string' },
                    impactScore: { type: 'integer', minimum: 1, maximum: 10 },
                    motivationStatement: { type: 'string' },
                },
                required: ['dreamId'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'completeDream',
            description: 'Mark dream COMPLETED. Confirm with user.',
            parameters: {
                type: 'object',
                properties: { dreamId: { type: 'string' } },
                required: ['dreamId'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'failDream',
            description: 'Mark dream FAILED. Destructive — confirm with user.',
            parameters: {
                type: 'object',
                properties: { dreamId: { type: 'string' } },
                required: ['dreamId'],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'archiveDream',
            description: 'Archive (delete) a dream. Destructive — confirm with user.',
            parameters: {
                type: 'object',
                properties: { dreamId: { type: 'string' } },
                required: ['dreamId'],
            },
        },
    },

    // ════════ ANALYTICS — read ════════

    {
        type: 'function',
        function: {
            name: 'getDashboard',
            description: 'Get current week analytics: discipline score, consistency, behavioral state, checkpoint activity. Use only when user asks about scores or progress.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'listSprints',
            description: 'Get historical weekly sprint summaries.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'getSprint',
            description: 'Get sprint analytics for a specific week.',
            parameters: {
                type: 'object',
                properties: {
                    weekStart: { type: 'string', description: 'YYYY-MM-DD Monday of the week' },
                },
                required: ['weekStart'],
            },
        },
    },

    // ════════ USER ════════

    {
        type: 'function',
        function: {
            name: 'getPreferences',
            description: 'Get user preferences: motivation tone, notifications, sleep schedule.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'updatePreferences',
            description: 'Update user preferences. Only pass fields the user wants to change. Confirm with user.',
            parameters: {
                type: 'object',
                properties: {
                    motivationTone: { type: 'string', enum: ['HARSH', 'POSITIVE', 'OPTIMISTIC', 'FEAR', 'LOGICAL', 'NEUTRAL'] },
                    notificationFrequency: { type: 'integer', description: 'Minutes between reminders' },
                    sleepStart: { type: 'string', description: 'HH:MM' },
                    sleepEnd: { type: 'string', description: 'HH:MM' },
                },
                required: [],
            },
        },
    },

    {
        type: 'function',
        function: {
            name: 'updateProfile',
            description: 'Update user profile (timezone). Confirm with user.',
            parameters: {
                type: 'object',
                properties: {
                    timezone: { type: 'string', description: 'IANA timezone e.g. Asia/Kolkata' },
                },
                required: ['timezone'],
            },
        },
    },

    // ════════ NOTIFICATIONS ════════

    {
        type: 'function',
        function: {
            name: 'listNotifications',
            description: 'Get recent notifications and reminders.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },

] as const;

// ── Tool Buckets for Optimized Context ─────────────────────────────────────

export const TASK_TOOLS = TOOLS.filter(t => 
    t.function.name.toLowerCase().includes('task') || 
    t.function.name.toLowerCase().includes('checkpoint')
);

export const DREAM_TOOLS = TOOLS.filter(t => 
    t.function.name.toLowerCase().includes('dream')
);

export const ANALYTICS_TOOLS = TOOLS.filter(t => 
    ['getDashboard', 'listSprints', 'getSprint'].includes(t.function.name)
);

export const USER_TOOLS = TOOLS.filter(t => 
    ['getPreferences', 'updatePreferences', 'updateProfile', 'listNotifications'].includes(t.function.name)
);

export type ToolName = typeof TOOLS[number]['function']['name'];
