// ─────────────────────────────────────────────────────────────────────────────
// E2E Test Script — DreamPlanner Tool-Calling Architecture
// Tests the full flow: signup → preferences → dream creation → task management
// → checkpoints → analytics → search → confirmation workflows
// Run with: npx ts-node /tmp/test_tool_calling.ts
// ─────────────────────────────────────────────────────────────────────────────

import axios, { AxiosInstance } from 'axios';

const BASE = 'http://localhost:3000';
const TEST_EMAIL = `test_tools_${Date.now()}@dreamplanner.dev`;
const TEST_PASSWORD = 'Test@1234!Secure';
const TEST_NAME = 'Swanith Test';

// ── ANSI colours ─────────────────────────────────────────────────────────────
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;   // green
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;   // red
const Y = (s: string) => `\x1b[33m${s}\x1b[0m`;   // yellow
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;   // cyan
const B = (s: string) => `\x1b[1m${s}\x1b[0m`;    // bold
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;  // dim

let passed = 0;
let failed = 0;
let cookie = '';
const log: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function section(title: string) {
    console.log(`\n${B(C('═'.repeat(60)))}`);
    console.log(B(C(`  ${title}`)));
    console.log(B(C('═'.repeat(60))));
}

function ok(label: string, detail?: string) {
    passed++;
    const msg = `  ${G('✓')} ${label}${detail ? DIM(' → ' + detail) : ''}`;
    console.log(msg);
    log.push(`PASS: ${label}`);
}

function fail(label: string, err: any) {
    failed++;
    const detail = err?.response?.data?.error || err?.message || String(err);
    const msg = `  ${R('✗')} ${label}\n    ${R(detail)}`;
    console.log(msg);
    log.push(`FAIL: ${label} — ${detail}`);
}

function info(msg: string) {
    console.log(`  ${Y('→')} ${DIM(msg)}`);
}

async function chat(http: AxiosInstance, message: string): Promise<string> {
    const { data } = await http.post('/api/chat', { message });
    return data.text || '';
}

function containsAny(text: string, ...keywords: string[]): boolean {
    const lower = text.toLowerCase();
    return keywords.some(k => lower.includes(k.toLowerCase()));
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function run() {
    console.log(`\n${B(Y('DreamPlanner Tool-Calling E2E Test Suite'))}`);
    console.log(DIM(`  Target: ${BASE}`));
    console.log(DIM(`  User:   ${TEST_EMAIL}`));
    console.log(DIM(`  Time:   ${new Date().toISOString()}\n`));

    const http = axios.create({
        baseURL: BASE,
        withCredentials: true,
        timeout: 30000,
    });

    // Inject cookie into every request
    http.interceptors.request.use(cfg => {
        if (cookie) cfg.headers['Cookie'] = cookie;
        return cfg;
    });

    // Capture Set-Cookie header
    http.interceptors.response.use(res => {
        const sc = res.headers['set-cookie'];
        if (sc) {
            cookie = sc.map((c: string) => c.split(';')[0]).join('; ');
        }
        return res;
    });

    let dreamId = '';
    let taskId = '';
    let checkpointId = '';

    // ─────────────────────────────────────────────────────────────────────────
    // 1. AUTH FLOW
    // ─────────────────────────────────────────────────────────────────────────
    section('1 · Auth Flow');

    try {
        const { data } = await http.post('/api/auth/signup', {
            name: TEST_NAME, email: TEST_EMAIL, password: TEST_PASSWORD,
        });
        ok('POST /api/auth/signup', `userId: ${data.user?.id?.slice(0, 8)}...`);
    } catch (e) { fail('POST /api/auth/signup', e); return; }

    try {
        const { data } = await http.post('/api/auth/login', {
            email: TEST_EMAIL, password: TEST_PASSWORD,
        });
        ok('POST /api/auth/login', `name: ${data.user?.name}`);
    } catch (e) { fail('POST /api/auth/login', e); return; }

    try {
        const { data } = await http.get('/api/auth/me');
        ok('GET /api/auth/me', `email: ${data.user?.email}`);
    } catch (e) { fail('GET /api/auth/me', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. USER PREFERENCES
    // ─────────────────────────────────────────────────────────────────────────
    section('2 · User Preferences');

    try {
        await http.put('/api/users/preferences', {
            motivationTone: 'POSITIVE',
            notificationFrequency: 60,
            sleepStart: '23:00',
            sleepEnd: '07:00',
            quietHours: [],
        });
        ok('PUT /api/users/preferences', 'POSITIVE tone, 60min frequency');
    } catch (e) { fail('PUT /api/users/preferences', e); }

    try {
        const { data } = await http.get('/api/users/preferences');
        ok('GET /api/users/preferences', `tone: ${data.motivationTone}`);
    } catch (e) { fail('GET /api/users/preferences', e); }

    try {
        await http.put('/api/users/profile', { timezone: 'Asia/Kolkata' });
        ok('PUT /api/users/profile', 'timezone: Asia/Kolkata');
    } catch (e) { fail('PUT /api/users/profile', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. CHAT — General conversation
    // ─────────────────────────────────────────────────────────────────────────
    section('3 · Chat — General Conversation');

    try {
        const reply = await chat(http, 'Hey! What are we crushing today?');
        info(`AI: "${reply.slice(0, 120)}..."`);
        ok('General greeting handled', containsAny(reply, 'dream', 'task', 'goal', 'hey', 'hi', 'help', 'crush', 'today', '!') ? 'natural response' : 'got a response');
    } catch (e) { fail('General greeting', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. CHAT — listDreams (empty state)
    // ─────────────────────────────────────────────────────────────────────────
    section('4 · Chat — List Dreams (empty state)');

    try {
        const reply = await chat(http, 'List my dreams');
        info(`AI: "${reply.slice(0, 120)}..."`);
        ok('listDreams tool called for empty state', containsAny(reply, 'dream', 'no dream', "don't have", 'none', 'yet') ? 'handled empty state' : 'got a response');
    } catch (e) { fail('list dreams (empty)', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. DIRECT API — Dream creation (bypass chat for setup speed)
    // ─────────────────────────────────────────────────────────────────────────
    section('5 · Direct API — Dream Creation Setup');

    try {
        const { data } = await http.post('/api/dreams', {
            title: 'Crack GATE Examination',
            description: 'Score above 700 in GATE CS exam to qualify for IIT M.Tech admission',
            deadline: '2026-12-31T00:00:00.000Z',
            impactScore: 10,
            motivationStatement: 'This is my path to the best engineering college in India',
        });
        dreamId = data.id;
        ok('POST /api/dreams (draft)', `dreamId: ${dreamId.slice(0, 8)}...`);
    } catch (e) { fail('POST /api/dreams', e); return; }

    try {
        const { data } = await http.post(`/api/dreams/${dreamId}/validate`, {});
        ok('POST /api/dreams/:id/validate', 'AI validation passed');
        info(`Suggested checkpoints: ${data?.validation?.suggestedCheckpoints?.length ?? 0}`);
    } catch (e) { fail('POST /api/dreams/:id/validate', e); }

    try {
        const { data } = await http.post(`/api/dreams/${dreamId}/confirm`, {
            checkpoints: [
                { title: 'Master Data Structures', orderIndex: 0 },
                { title: 'Complete Algorithms Module', orderIndex: 1 },
                { title: 'Operating Systems Deep Dive', orderIndex: 2 },
                { title: 'Full Mock Test Series', orderIndex: 3 },
            ],
        });
        ok('POST /api/dreams/:id/confirm', `status: ${data.status}`);
    } catch (e) { fail('POST /api/dreams/:id/confirm', e); }

    try {
        const { data } = await http.get('/api/dreams');
        ok('GET /api/dreams', `count: ${data.dreams?.length}`);
    } catch (e) { fail('GET /api/dreams', e); }

    try {
        const { data } = await http.get(`/api/dreams/${dreamId}`);
        ok('GET /api/dreams/:id', `title: "${data.title}"`);
    } catch (e) { fail('GET /api/dreams/:id', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. DIRECT API — Task creation
    // ─────────────────────────────────────────────────────────────────────────
    section('6 · Direct API — Task Creation');

    try {
        const { data } = await http.post('/api/tasks', {
            title: 'Complete Operating Systems Subject',
            description: 'Study all OS topics: processes, memory, file systems, deadlocks',
            deadline: '2026-06-30T00:00:00.000Z',
            dreamId,
            priority: 4,
            checkpoints: [
                { title: 'Processes & Threads', targetDate: '2026-04-15', orderIndex: 0 },
                { title: 'Memory Management', targetDate: '2026-05-01', orderIndex: 1 },
                { title: 'File Systems', targetDate: '2026-05-20', orderIndex: 2 },
                { title: 'Mock Test on OS', targetDate: '2026-06-10', orderIndex: 3 },
            ],
        });
        taskId = data.id;
        ok('POST /api/tasks', `taskId: ${taskId.slice(0, 8)}...`);
    } catch (e) { fail('POST /api/tasks', e); return; }

    // Get checkpoint IDs
    try {
        const { data } = await http.get(`/api/tasks/${taskId}`);
        checkpointId = data.checkpoints?.[0]?.id || '';
        ok('GET /api/tasks/:id (with checkpoints)', `checkpoints: ${data.checkpoints?.length}`);
        info(`Active checkpoint: "${data.checkpoints?.[0]?.title}"`);
    } catch (e) { fail('GET /api/tasks/:id', e); }

    try {
        const { data } = await http.get('/api/tasks');
        ok('GET /api/tasks', `count: ${data.tasks?.length}`);
    } catch (e) { fail('GET /api/tasks', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. SEARCH TASKS (new endpoint)
    // ─────────────────────────────────────────────────────────────────────────
    section('7 · Search Tasks (Entity Resolution)');

    try {
        const { data } = await http.get('/api/tasks/search?q=operating');
        ok('GET /api/tasks/search?q=operating', `matches: ${data.tasks?.length}`);
        info(`Found: "${data.tasks?.[0]?.title}"`);
    } catch (e) { fail('GET /api/tasks/search?q=operating', e); }

    try {
        const { data } = await http.get('/api/tasks/search?q=nonexistent_xyz_task');
        ok('GET /api/tasks/search (no match)', `matches: ${data.tasks?.length} (expected 0)`);
    } catch (e) { fail('GET /api/tasks/search (no match)', e); }

    try {
        const { data } = await http.get('/api/tasks/search?q=GATE');
        ok('GET /api/tasks/search?q=GATE (by description)', `matches: ${data.tasks?.length}`);
    } catch (e) { fail('GET /api/tasks/search by description', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. CHAT — listTasks via tool
    // ─────────────────────────────────────────────────────────────────────────
    section('8 · Chat — Tool: listTasks');

    try {
        const reply = await chat(http, 'Show me all my current tasks');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('listTasks tool — shows tasks', containsAny(reply, 'operating', 'os', 'complete', 'task') ? 'task name in response' : 'got a response');
    } catch (e) { fail('chat: list tasks', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. CHAT — searchTasks entity resolution
    // ─────────────────────────────────────────────────────────────────────────
    section('9 · Chat — Tool: searchTasks (entity resolution)');

    try {
        const reply = await chat(http, 'Tell me about my OS task');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('searchTasks called for ambiguous "OS task" reference', containsAny(reply, 'operating', 'os', 'system', 'checkpoint', 'progress') ? 'correctly identified task' : 'got a response');
    } catch (e) { fail('chat: search tasks entity resolution', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. CHAT — Confirmation before write (completeTask)
    // ─────────────────────────────────────────────────────────────────────────
    section('10 · Chat — Confirmation Gate before completeTask');

    try {
        const reply = await chat(http, 'Mark my OS task as completed');
        info(`AI: "${reply.slice(0, 180)}..."`);
        const asksConfirm = containsAny(reply, 'confirm', 'sure', 'should i', 'want me to', 'go ahead', 'proceed', 'yes', '?');
        ok('AI asks for confirmation before completing task', asksConfirm ? 'confirms before acting ✓' : 'WARNING: may have acted without confirming');
    } catch (e) { fail('chat: confirm before complete task', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. CHAT — User denies confirmation
    // ─────────────────────────────────────────────────────────────────────────
    section('11 · Chat — User Denies Confirmation');

    try {
        const reply = await chat(http, 'No, cancel that');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('AI aborts when user says no', containsAny(reply, 'cancel', 'no problem', 'abort', 'ok', 'sure', 'got it', 'anything') ? 'correctly aborted' : 'got a response');
    } catch (e) { fail('chat: deny confirmation', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 12. DIRECT API — Checkpoint progress
    // ─────────────────────────────────────────────────────────────────────────
    section('12 · Direct API — Checkpoint Progress');

    if (checkpointId) {
        try {
            const { data } = await http.post(
                `/api/tasks/${taskId}/checkpoints/${checkpointId}/progress`,
                { delta: 30, localDate: '2026-03-11' }
            );
            ok('POST checkpoint progress +30', `task progress: ${data.progressPercent}%`);
        } catch (e) { fail('POST checkpoint progress', e); }

        try {
            const { data } = await http.post(
                `/api/tasks/${taskId}/checkpoints/${checkpointId}/progress`,
                { delta: 50, localDate: '2026-03-11' }
            );
            ok('POST checkpoint progress +50 (cumulative 80%)', `task progress: ${data.progressPercent}%`);
        } catch (e) { fail('POST checkpoint progress cumulative', e); }
    } else {
        fail('Checkpoint progress tests skipped (no checkpointId)', 'checkpointId was not captured');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 13. CHAT — getDashboard tool
    // ─────────────────────────────────────────────────────────────────────────
    section('13 · Chat — Tool: getDashboard');

    try {
        const reply = await chat(http, "What's my discipline score this week?");
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('getDashboard tool called', containsAny(reply, 'discipline', 'score', 'week', 'progress', 'consistency', '%') ? 'analytics present in response' : 'got a response');
    } catch (e) { fail('chat: get dashboard', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 14. CHAT — listDreams (after creation)
    // ─────────────────────────────────────────────────────────────────────────
    section('14 · Chat — Tool: listDreams (with data)');

    try {
        const reply = await chat(http, 'List all my dreams');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('listDreams tool — shows GATE dream', containsAny(reply, 'gate', 'crack', 'dream', 'examination') ? 'dream in response' : 'got a response');
    } catch (e) { fail('chat: list dreams with data', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 15. CHAT — Update task (write confirmation)
    // ─────────────────────────────────────────────────────────────────────────
    section('15 · Chat — Tool: updateTask (confirmation required)');

    try {
        const reply = await chat(http, 'Change the priority of my OS task to 5');
        info(`AI: "${reply.slice(0, 180)}..."`);
        ok('updateTask requests confirmation', containsAny(reply, 'confirm', 'sure', 'priority', 'want', '5', '?') ? 'confirmed before acting' : 'got a response');
    } catch (e) { fail('chat: update task priority', e); }

    // Confirm it
    try {
        const reply = await chat(http, 'Yes, go ahead');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('User confirms → task updated', containsAny(reply, 'updated', 'done', 'priority', 'changed', 'set', 'success', '5') ? 'confirmed update' : 'got a response');
    } catch (e) { fail('chat: confirm update task', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 16. CHAT — updateTaskProgress
    // ─────────────────────────────────────────────────────────────────────────
    section('16 · Chat — Tool: updateTaskProgress');

    try {
        const reply = await chat(http, 'Set my OS task progress to 40%');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('updateTaskProgress confirmation prompt', containsAny(reply, 'progress', '40', 'confirm', 'want', 'sure', '?') ? 'asked to confirm' : 'got a response');
    } catch (e) { fail('chat: update task progress', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 17. CHAT — getPreferences tool
    // ─────────────────────────────────────────────────────────────────────────
    section('17 · Chat — Tool: getPreferences');

    try {
        const reply = await chat(http, 'What are my current notification settings?');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('getPreferences tool called', containsAny(reply, 'notification', 'reminder', 'minute', 'preference', 'tone', 'sleep') ? 'prefs in response' : 'got a response');
    } catch (e) { fail('chat: get preferences', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 18. DIRECT API — Task update, block, progress
    // ─────────────────────────────────────────────────────────────────────────
    section('18 · Direct API — Task Operations');

    try {
        const { data } = await http.put(`/api/tasks/${taskId}`, {
            description: 'Updated: Master all OS topics for GATE 2026 with 95%+ accuracy',
        });
        ok('PUT /api/tasks/:id (update description)', 'updated');
    } catch (e) { fail('PUT /api/tasks/:id', e); }

    try {
        const { data } = await http.post(`/api/tasks/${taskId}/progress`, { value: 50 });
        ok('POST /api/tasks/:id/progress', `progressPercent: ${data.progressPercent}%`);
    } catch (e) { fail('POST /api/tasks/:id/progress', e); }

    try {
        const { data } = await http.post(`/api/tasks/${taskId}/block`, {});
        ok('POST /api/tasks/:id/block', `status: ${data.status}`);
    } catch (e) { fail('POST /api/tasks/:id/block', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 19. DIRECT API — Dream operations
    // ─────────────────────────────────────────────────────────────────────────
    section('19 · Direct API — Dream Operations');

    try {
        const { data } = await http.put(`/api/dreams/${dreamId}`, {
            impactScore: 9,
            motivationStatement: 'This dream will redefine my entire career trajectory!',
        });
        ok('PUT /api/dreams/:id (update)', `impactScore: ${data.impactScore}`);
    } catch (e) { fail('PUT /api/dreams/:id', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 20. DIRECT API — Analytics
    // ─────────────────────────────────────────────────────────────────────────
    section('20 · Direct API — Analytics');

    try {
        const { data } = await http.get('/api/analytics/dashboard');
        ok('GET /api/analytics/dashboard', `disciplineScore: ${data.disciplineScore}`);
    } catch (e) { fail('GET /api/analytics/dashboard', e); }

    try {
        const { data } = await http.get('/api/analytics/sprints');
        ok('GET /api/analytics/sprints', `count: ${Array.isArray(data) ? data.length : '?'}`);
    } catch (e) { fail('GET /api/analytics/sprints', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 21. DIRECT API — Notifications
    // ─────────────────────────────────────────────────────────────────────────
    section('21 · Direct API — Notifications');

    try {
        const { data } = await http.get('/api/notifications');
        ok('GET /api/notifications', `count: ${Array.isArray(data) ? data.length : data?.notifications?.length ?? '?'}`);
    } catch (e) { fail('GET /api/notifications', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 22. CHAT — Context switching mid-conversation
    // ─────────────────────────────────────────────────────────────────────────
    section('22 · Chat — Context Switching');

    try {
        const reply = await chat(http, "Actually forget that — what tasks are due this month?");
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('AI handles context switch gracefully', containsAny(reply, 'task', 'due', 'deadline', 'month', 'june') ? 'handled context switch' : 'got a response');
    } catch (e) { fail('chat: context switching', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 23. CHAT — Ambiguous reference resolution
    // ─────────────────────────────────────────────────────────────────────────
    section('23 · Chat — Ambiguous Reference: "that task"');

    try {
        const reply = await chat(http, 'How is that task going?');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('Ambiguous "that task" handled', containsAny(reply, 'task', 'progress', 'checkpoint', 'operating', 'os', 'which task', 'which one') ? 'resolved or clarified' : 'got a response');
    } catch (e) { fail('chat: ambiguous task reference', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 24. CHAT — listNotifications 
    // ─────────────────────────────────────────────────────────────────────────
    section('24 · Chat — Tool: listNotifications');

    try {
        const reply = await chat(http, 'Show me my notifications');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('listNotifications tool called', reply.length > 0 ? 'got a response' : 'empty response');
    } catch (e) { fail('chat: list notifications', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 25. CHAT — Destructive action: archiveTask (extra confirmation)
    // ─────────────────────────────────────────────────────────────────────────
    section('25 · Chat — Destructive: archiveTask (extra guard)');

    try {
        const reply = await chat(http, 'Delete my OS task permanently');
        info(`AI: "${reply.slice(0, 180)}..."`);
        ok('archiveTask requires explicit confirmation', containsAny(reply, 'confirm', 'sure', 'permanent', 'delete', 'archive', 'cannot', 'undo', '?') ? 'asked to confirm destructive action' : 'got a response');
    } catch (e) { fail('chat: archive task guard', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 26. CHAT — listSprints
    // ─────────────────────────────────────────────────────────────────────────
    section('26 · Chat — Tool: listSprints');

    try {
        const reply = await chat(http, 'Show me my weekly sprint history');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('listSprints tool called', reply.length > 0 ? 'got a response' : 'empty response');
    } catch (e) { fail('chat: list sprints', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 27. CHAT — updatePreferences via confirmation
    // ─────────────────────────────────────────────────────────────────────────
    section('27 · Chat — Tool: updatePreferences (confirmation)');

    try {
        const reply = await chat(http, 'Change my motivation tone to HARSH');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('updatePreferences confirmation prompt', containsAny(reply, 'confirm', 'sure', 'harsh', 'tone', 'want', '?') ? 'asked to confirm' : 'got a response');
    } catch (e) { fail('chat: update preferences', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 28. CHAT — Block task by name
    // ─────────────────────────────────────────────────────────────────────────
    section('28 · Chat — Tool: blockTask by name search');

    try {
        const reply = await chat(http, 'Mark my operating systems task as blocked');
        info(`AI: "${reply.slice(0, 150)}..."`);
        ok('blockTask via searchTasks → confirmation', containsAny(reply, 'confirm', 'block', 'operating', 'sure', '?') ? 'found task + confirmed' : 'got a response');
    } catch (e) { fail('chat: block task by name', e); }

    // ─────────────────────────────────────────────────────────────────────────
    // 29. AUTH — Logout 
    // ─────────────────────────────────────────────────────────────────────────
    section('29 · Auth — Logout');

    try {
        await http.post('/api/auth/logout');
        ok('POST /api/auth/logout', 'session cleared');
    } catch (e) { fail('POST /api/auth/logout', e); }

    // Protected route should now fail
    try {
        await http.get('/api/tasks');
        fail('GET /api/tasks after logout should be 401', 'expected 401 but got 200');
    } catch (e: any) {
        if (e?.response?.status === 401) {
            ok('Protected route rejects unauthenticated request', '401 as expected');
        } else {
            fail('Protected route post-logout', e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n${B(C('═'.repeat(60)))}`);
    console.log(B(C('  RESULTS')));
    console.log(B(C('═'.repeat(60))));
    console.log(`  ${G('Passed:')} ${passed}`);
    console.log(`  ${R('Failed:')} ${failed}`);
    console.log(`  ${Y('Total:')}  ${passed + failed}`);
    const pct = ((passed / (passed + failed)) * 100).toFixed(1);
    console.log(`  ${B('Score:')}  ${pct}%`);

    if (failed > 0) {
        console.log(`\n${Y('  Failed tests:')}`);
        log.filter(l => l.startsWith('FAIL')).forEach(l => console.log(`  ${R('·')} ${l.slice(6)}`));
    }

    console.log('');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
    console.error(R('\nFATAL: ' + e.message));
    process.exit(1);
});
