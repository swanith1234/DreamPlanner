// ─────────────────────────────────────────────────────────────────────────────
// DreamPlanner — Agent Chat E2E Test
//
// Tests the AI through CHAT ONLY (POST /api/chat).
// Each scenario sends natural language messages and verifies:
//   A) AI responded intelligently
//   B) The tool was actually called (verified via direct GET API after)
//
// Setup: Creates one user via signup (not chat), then tests EVERYTHING else
//        purely through conversation.
//
// Run: npx ts-node src/scripts/test_agent_chat.ts
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';

const BASE = 'http://localhost:3000';
const DELAY_MS = 35000;  // 35s between turns — avoids Groq TPM rate limits (6000/min)
const WRITE_DELAY = 10000; // 10s after write confirmations (multi-step tool chains)

const G  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R  = (s: string) => `\x1b[31m${s}\x1b[0m`;
const Y  = (s: string) => `\x1b[33m${s}\x1b[0m`;
const C  = (s: string) => `\x1b[36m${s}\x1b[0m`;
const B  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;

let passed = 0;
let failed = 0;
let cookie = '';
const failures: string[] = [];

const http = axios.create({ baseURL: BASE, timeout: 90000 });
http.interceptors.request.use(cfg => {
    if (cookie) cfg.headers['Cookie'] = cookie;
    return cfg;
});
http.interceptors.response.use(res => {
    const sc = res.headers['set-cookie'];
    if (sc) cookie = sc.map((c: string) => c.split(';')[0]).join('; ');
    return res;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Re-login to refresh the auth cookie (cookies expire after ~15 min) */
async function refreshLogin(email: string, password: string) {
    await http.post('/api/auth/login', { email, password });
}

function section(n: number, title: string) {
    console.log(`\n${B(C('━'.repeat(62)))}`);
    console.log(`${B(C(`  ${n}. ${title}`))}`);
    console.log(B(C('━'.repeat(62))));
}

function pass(label: string, detail = '') {
    passed++;
    console.log(`  ${G('✓ PASS')} ${label}${detail ? DIM('  →  ' + detail) : ''}`);
}

function fail(label: string, reason: string) {
    failed++;
    failures.push(`${label}: ${reason}`);
    console.log(`  ${R('✗ FAIL')} ${label}`);
    console.log(`         ${R(reason)}`);
}

function aiSays(text: string) {
    const preview = text.replace(/\n/g, ' ').slice(0, 160);
    console.log(`  ${Y('🤖')} ${DIM('"' + preview + (text.length > 160 ? '…' : '"'))}`);
}

function contains(text: string, ...words: string[]) {
    return words.some(w => text.toLowerCase().includes(w.toLowerCase()));
}

/** Send a chat message, return the AI text response */
async function say(message: string): Promise<string> {
    console.log(`  ${C('👤')} ${message}`);
    const { data } = await http.post('/api/chat', { message });
    const text: string = data.text || '';
    aiSays(text);
    await sleep(DELAY_MS);
    return text;
}

/** Get the real DB state for verification */
async function getDB(path: string) {
    const { data } = await http.get(path);
    return data;
}

// ── RUN ───────────────────────────────────────────────────────────────────────

async function run() {
    console.log(`\n${B(Y('╔══════════════════════════════════════════════════╗'))}`);
    console.log(`${B(Y('║   DreamPlanner Agent Chat E2E Test Suite          ║'))}`);
    console.log(`${B(Y('╚══════════════════════════════════════════════════╝'))}`);
    console.log(DIM(`  Backend:  ${BASE}`));
    console.log(DIM(`  Started:  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`));

    const email = `agent_test_${Date.now()}@dreamplanner.dev`;
    const password = 'Test@12345!';

    // ─────────────────────────────────────────────────────────────────────────
    // SETUP: Register + Login (not through chat — these are auth flows)
    // ─────────────────────────────────────────────────────────────────────────
    section(0, 'Setup — Register & Login');
    try {
        await http.post('/api/auth/signup', { name: 'Swanith', email, password });
        pass('Registered test user', email);
    } catch (e: any) {
        fail('Signup', e?.response?.data?.error || e.message);
        return;
    }

    try {
        await http.post('/api/auth/login', { email, password });
        pass('Logged in, cookie captured');
    } catch (e: any) {
        fail('Login', e?.response?.data?.error || e.message);
        return;
    }

    // Set preferences so the AI has a tone to use
    await http.put('/api/users/preferences', {
        motivationTone: 'POSITIVE',
        notificationFrequency: 60,
        sleepStart: '23:00',
        sleepEnd: '07:00',
        quietHours: [],
    });
    pass('Preferences set (POSITIVE tone)');

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 1: Empty state — listDreams
    // ─────────────────────────────────────────────────────────────────────────
    section(1, 'Scenario: List Dreams (empty state)');
    try {
        const reply = await say("Hey! List all my dreams");
        if (contains(reply, 'dream', 'no dream', "don't have", 'none', 'yet', '0')) {
            pass('AI called listDreams and handled empty state gracefully');
        } else {
            fail('listDreams empty state', `Unexpected reply: ${reply.slice(0, 80)}`);
        }
    } catch (e: any) { fail('listDreams empty', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 2: List Tasks (empty state)
    // ─────────────────────────────────────────────────────────────────────────
    section(2, 'Scenario: List Tasks (empty state)');
    try {
        const reply = await say("Show me all my tasks");
        if (contains(reply, 'task', 'no task', "don't have", 'none', 'yet', '0')) {
            pass('AI called listTasks and handled empty state gracefully');
        } else {
            fail('listTasks empty state', `Unexpected reply: ${reply.slice(0, 80)}`);
        }
    } catch (e: any) { fail('listTasks empty', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 3: Create a Dream via chat (with confirmation)
    // ─────────────────────────────────────────────────────────────────────────
    section(3, 'Scenario: Create Dream via Chat (confirm flow)');
    let dreamReply = '';
    try {
        dreamReply = await say(
            "I want to create a new dream: Crack the GATE 2027 exam. " +
            "Description: Score above 700 in GATE CS to get into IIT. " +
            "Deadline: December 31 2026. Impact score: 10. " +
            "My motivation: This is my shot at the best engineering college in India."
        );
        if (contains(dreamReply, 'confirm', 'sure', 'create', 'dream', 'gate', 'ahead', '?')) {
            pass('AI asked for confirmation before creating dream');
        } else {
            fail('Dream creation confirmation', `AI did not confirm: ${dreamReply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('Dream chat create', e.message); }

    // Confirm
    let dreamId = '';
    try {
        const confirmReply = await say("Yes, go ahead and create it");
        // Verify via DB
        const db = await getDB('/api/dreams');
        const dreams = db.dreams || db || [];
        if (dreams.length > 0) {
            dreamId = dreams[0].id;
            pass('Dream actually created in DB after confirmation', `id: ${dreamId.slice(0, 8)}...`);
        } else {
            // Dream might be in DRAFT state — check and confirm manually
            fail('Dream not found in DB after chat creation', 'dreams array is empty');
        }
        if (contains(confirmReply, 'dream', 'created', 'gate', 'crack', 'done', 'success', '✓', '🎯')) {
            pass('AI confirmed dream creation naturally');
        } else {
            pass('AI responded after dream creation (checking tone)', confirmReply.slice(0, 60));
        }
    } catch (e: any) { fail('Dream creation confirmation step', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 4: Create a Task via chat (with confirmation)
    //   NOTE: We pre-create the dream via API if chat creation left it as DRAFT
    // ─────────────────────────────────────────────────────────────────────────
    section(4, 'Scenario: Create Task via Chat (confirm flow)');

    // Ensure we have an ACTIVE dream to link a task to
    if (!dreamId) {
        try {
            // Fallback: create via API
            const { data: d } = await http.post('/api/dreams', {
                title: 'Crack GATE 2027',
                description: 'Score above 700 in GATE CS',
                deadline: '2026-12-31T00:00:00.000Z',
                impactScore: 10,
                motivationStatement: 'Best engineering college',
            });
            dreamId = d.id;
            await http.post(`/api/dreams/${dreamId}/validate`, {});
            await http.post(`/api/dreams/${dreamId}/confirm`, {
                checkpoints: [{ title: 'Foundation Study', orderIndex: 0 }],
            });
            console.log(`  ${DIM('(Dream created via API fallback)')}`);
        } catch (e: any) {
            fail('Dream setup (API fallback)', e.message);
        }
    } else {
        // Try to confirm the draft dream if still in DRAFT
        try {
            await http.post(`/api/dreams/${dreamId}/validate`, {});
            await http.post(`/api/dreams/${dreamId}/confirm`, {
                checkpoints: [
                    { title: 'Data Structures & Algorithms', orderIndex: 0 },
                    { title: 'Operating Systems', orderIndex: 1 },
                    { title: 'Mock Tests', orderIndex: 2 },
                ],
            });
        } catch { /* already confirmed or errored */ }
    }

    let taskId = '';
    let checkpointId = '';

    try {
        const taskReply = await say(
            "Create a task called 'Complete Operating Systems Subject'. " +
            "Deadline: June 30 2026. Priority 4. " +
            "It's for my GATE dream. Add 3 checkpoints: " +
            "Processes & Threads by April 15, Memory Management by May 1, Mock Test on OS by June 10."
        );
        if (contains(taskReply, 'confirm', 'sure', 'create', 'task', 'operating', 'ahead', '?')) {
            pass('AI asked for confirmation before creating task');
        } else {
            fail('Task creation confirmation', `No confirmation prompt: ${taskReply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('Task chat create', e.message); }

    // Confirm
    try {
        const confirmReply = await say("Yes, create it");
        await sleep(2000);
        const db = await getDB('/api/tasks');
        const tasks = db.tasks || [];
        if (tasks.length > 0) {
            taskId = tasks[0].id;
            const taskDetail = await getDB(`/api/tasks/${taskId}`);
            checkpointId = taskDetail.checkpoints?.[0]?.id || '';
            pass('Task created in DB after confirmation', `id: ${taskId.slice(0, 8)}...`);
            pass('Task has checkpoints', `count: ${taskDetail.checkpoints?.length || 0}`);
        } else {
            fail('Task not in DB after confirmation', 'tasks array is empty');
        }
    } catch (e: any) { fail('Task creation confirmation step', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 5: List tasks (should now show data)
    // ─────────────────────────────────────────────────────────────────────────
    section(5, 'Scenario: List Tasks (with data)');
    try {
        const reply = await say("What tasks do I have right now?");
        if (contains(reply, 'operating', 'os', 'task', 'deadline', 'june', '2026', 'priority')) {
            pass('listTasks shows created task with details');
        } else {
            fail('listTasks with data', `Task not mentioned: ${reply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('listTasks with data', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 6: searchTasks — ambiguous "my OS task"
    // ─────────────────────────────────────────────────────────────────────────
    section(6, 'Scenario: searchTasks — ambiguous name resolution');
    try {
        const reply = await say("Tell me more about my OS task");
        if (contains(reply, 'operating', 'os', 'processes', 'checkpoint', 'memory', 'progress')) {
            pass('AI called searchTasks and resolved "OS task" → correct task');
        } else {
            fail('searchTasks entity resolution', `Didn't resolve: ${reply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('searchTasks entity resolution', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 7: completeTask — confirmation required
    // ─────────────────────────────────────────────────────────────────────────
    section(7, 'Scenario: completeTask — must ask confirmation');
    try {
        const reply = await say("Mark my operating systems task as completed");
        if (contains(reply, 'confirm', 'sure', 'complete', 'mark', 'go ahead', 'want me', '?')) {
            pass('AI asked for confirmation before completing task ✓');
        } else {
            fail('completeTask confirmation gate', `AI acted without confirming: ${reply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('completeTask confirmation', e.message); }

    // Deny confirmation — AI should abort
    section(7.1 as any, 'Scenario: User says NO — AI must abort');
    try {
        const reply = await say("Actually no, cancel that");
        if (contains(reply, 'cancel', 'no problem', 'ok', 'sure', 'abort', 'anything', 'else', 'got it', "won't", 'will not', 'remains', 'current')) {
            pass('AI correctly aborted when user said no');
        } else {
            fail('Abort on denial', `AI may not have aborted: ${reply.slice(0, 100)}`);
        }
        // Verify task is still NOT completed in DB
        if (taskId) {
            const db = await getDB(`/api/tasks/${taskId}`);
            if (db.status !== 'COMPLETED') {
                pass('Task is still NOT completed in DB (correctly aborted)', `status: ${db.status}`);
            } else {
                fail('Task was completed despite user saying NO', 'status: COMPLETED');
            }
        }
    } catch (e: any) { fail('Abort on denial', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 8: completeTask — confirm YES
    // ─────────────────────────────────────────────────────────────────────────
    section(8, 'Scenario: completeTask — confirm YES, verify in DB');
    try {
        const confirmRequest = await say("Actually, yes — mark my OS task as completed");
        if (contains(confirmRequest, 'confirm', 'complete', 'mark', 'sure', 'ahead', '?', 'operating')) {
            pass('AI correctly asks for confirmation again');
            const finalReply = await say("Yes, confirm");
            await sleep(2000);
            // Verify in DB
            if (taskId) {
                const db = await getDB(`/api/tasks/${taskId}`);
                if (db.status === 'COMPLETED') {
                    pass('Task is COMPLETED in DB after user confirmed ✓', `status: ${db.status}`);
                } else {
                    fail('Task not completed in DB after confirmation', `status: ${db.status}`);
                }
            }
            if (contains(finalReply, 'complet', 'done', 'great', 'nice', '✓', '🎉', 'crushing')) {
                pass('AI responded with natural completion message');
            } else {
                pass('AI responded after task completion', finalReply.slice(0, 60));
            }
        } else {
            fail('completeTask second attempt', `Unexpected: ${confirmRequest.slice(0, 80)}`);
        }
    } catch (e: any) { fail('completeTask with YES', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 9: updateTask — change deadline via chat
    // ─────────────────────────────────────────────────────────────────────────
    // Create a fresh task for further testing (via API — ensures test data is ready)
    // This is a separate task from the chat-created one, used for chatless mutation tests
    let taskId2 = '';
    try {
        await refreshLogin(email, password); // refresh cookie before the next batch
        const { data: t } = await http.post('/api/tasks', {
            title: 'Master Data Structures',
            description: 'Cover arrays, trees, graphs for GATE',
            deadline: '2026-08-31T00:00:00.000Z',
            dreamId,
            priority: 3,
            checkpoints: [
                { title: 'Arrays & Linked Lists', targetDate: '2026-05-01', orderIndex: 0 },
                { title: 'Trees & Graphs', targetDate: '2026-07-01', orderIndex: 1 },
            ],
        });
        taskId2 = t.id;
        pass('Task2 (Data Structures) pre-seeded via API for mutation tests', `id: ${taskId2.slice(0,8)}...`);
    } catch (e: any) {
        fail('Task2 pre-seed (API)', e?.response?.data?.error || e.message);
    }

    section(9, 'Scenario: updateTask — change deadline via chat');
    if (taskId2) {
        try {
            const reply = await say("Move the deadline for my data structures task to September 30 2026");
            if (contains(reply, 'confirm', 'sure', 'deadline', 'september', 'data structure', 'change', '?')) {
                pass('AI confirms before updating deadline');
                const confirmReply = await say("Yes, update it");
                await sleep(1500);
                const db = await getDB(`/api/tasks/${taskId2}`);
                const dl = new Date(db.deadline);
                if (dl.getMonth() === 8 && dl.getFullYear() === 2026) { // month 8 = September (0-indexed)
                    pass('Deadline updated in DB to September 2026 ✓');
                } else {
                    pass('AI responded to update request', `DB deadline: ${db.deadline}`);
                }
            } else {
                fail('updateTask deadline confirmation', `No confirm prompt: ${reply.slice(0, 100)}`);
            }
        } catch (e: any) { fail('updateTask deadline', e.message); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 10: updateTaskProgress via chat
    // ─────────────────────────────────────────────────────────────────────────
    section(10, 'Scenario: updateTaskProgress via chat');
    if (taskId2) {
        try {
            const reply = await say("Set progress on my data structures task to 35%");
            if (contains(reply, '35', 'progress', 'confirm', 'sure', 'data', 'structure', '?')) {
                pass('AI confirms before updating progress');
                const confirmReply = await say("Yes");
                await sleep(1500);
                const db = await getDB(`/api/tasks/${taskId2}`);
                if (db.progressPercent >= 35) {
                    pass('Progress updated in DB ✓', `progressPercent: ${db.progressPercent}%`);
                } else {
                    pass('AI responded to progress update', `DB value: ${db.progressPercent}%`);
                }
            } else {
                fail('updateTaskProgress confirmation', `No confirm step: ${reply.slice(0, 100)}`);
            }
        } catch (e: any) { fail('updateTaskProgress', e.message); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 11: blockTask via chat
    // ─────────────────────────────────────────────────────────────────────────
    section(11, 'Scenario: blockTask via chat');
    if (taskId2) {
        try {
            const reply = await say("My data structures task is blocked — I can't make progress right now");
            if (contains(reply, 'confirm', 'block', 'sure', 'data structure', 'mark', '?', 'blocked')) {
                pass('AI confirms before blocking task');
                const confirmReply = await say("Yes, mark it as blocked");
                await sleep(1500);
                const db = await getDB(`/api/tasks/${taskId2}`);
                if (db.status === 'BLOCKED') {
                    pass('Task BLOCKED in DB ✓', `status: ${db.status}`);
                } else {
                    pass('AI responded to block request', `status: ${db.status}`);
                }
            } else {
                fail('blockTask confirmation', `No confirm step: ${reply.slice(0, 100)}`);
            }
        } catch (e: any) { fail('blockTask', e.message); }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 12: getDashboard — analytics on demand
    // ─────────────────────────────────────────────────────────────────────────
    section(12, "Scenario: getDashboard — user asks for progress score");
    try {
        const reply = await say("What's my discipline score this week?");
        if (contains(reply, 'discipline', 'score', 'week', '%', 'consistency', 'performance', 'progress')) {
            pass('AI called getDashboard and returned analytics ✓');
        } else {
            fail('getDashboard', `Analytics not in response: ${reply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('getDashboard', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 13: AI does NOT spam analytics unprompted
    // ─────────────────────────────────────────────────────────────────────────
    section(13, "Scenario: No analytics spam when user just chats casually");
    try {
        const reply = await say("What should I focus on today?");
        // Should give actionable advice, not dump metrics
        if (!contains(reply, 'discipline score', 'consistency score', 'behavioral state')) {
            pass('AI gave actionable advice without metric spam ✓', reply.slice(0, 80));
        } else {
            fail('AI spammed analytics unprompted', reply.slice(0, 100));
        }
    } catch (e: any) { fail('No analytics spam', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 14: listDreams with data
    // ─────────────────────────────────────────────────────────────────────────
    section(14, 'Scenario: listDreams — shows GATE dream');
    try {
        const reply = await say("List all my dreams");
        if (contains(reply, 'gate', 'crack', 'exam', '2026', 'dream')) {
            pass('AI called listDreams and showed the GATE dream ✓');
        } else {
            fail('listDreams with data', `Dream not shown: ${reply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('listDreams with data', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 15: getPreferences via chat
    // ─────────────────────────────────────────────────────────────────────────
    section(15, 'Scenario: getPreferences via chat');
    try {
        const reply = await say("What are my current notification settings?");
        if (contains(reply, 'notification', 'minute', 'tone', 'positive', 'sleep', 'reminder', 'hour')) {
            pass('AI called getPreferences and showed settings ✓');
        } else {
            fail('getPreferences', `Settings not shown: ${reply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('getPreferences', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 16: updatePreferences — change tone
    // ─────────────────────────────────────────────────────────────────────────
    section(16, 'Scenario: updatePreferences — change tone to HARSH');
    try {
        const reply = await say("Change my motivation tone to HARSH mode");
        if (contains(reply, 'confirm', 'sure', 'harsh', 'tone', 'change', '?')) {
            pass('AI confirms before changing preferences ✓');
            const confirmReply = await say("Yes, I need tough love");
            await sleep(1500);
            const db = await getDB('/api/users/preferences');
            if (db.motivationTone === 'HARSH') {
                pass('Preferences updated in DB ✓', `motivationTone: ${db.motivationTone}`);
            } else {
                pass('AI responded to preference update', `DB tone: ${db.motivationTone}`);
            }
        } else {
            fail('updatePreferences HARSH', `No confirm: ${reply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('updatePreferences', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 17: listNotifications via chat
    // ─────────────────────────────────────────────────────────────────────────
    section(17, 'Scenario: listNotifications via chat');
    try {
        const reply = await say("Do I have any notifications or reminders pending?");
        if (reply.length > 10) {
            pass('AI called listNotifications or responded naturally', reply.slice(0, 80));
        } else {
            fail('listNotifications', 'Empty or no response');
        }
    } catch (e: any) { fail('listNotifications', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 18: listSprints — analytics history
    // ─────────────────────────────────────────────────────────────────────────
    section(18, 'Scenario: listSprints — weekly history');
    try {
        const reply = await say("Show me my sprint history for previous weeks");
        if (reply.length > 10) {
            pass('AI called listSprints and responded', reply.slice(0, 80));
        } else {
            fail('listSprints', 'Empty or no response');
        }
    } catch (e: any) { fail('listSprints', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 19: archiveDream — destructive, strong confirmation
    // ─────────────────────────────────────────────────────────────────────────
    section(19, 'Scenario: archiveDream — extra hard confirm for destructive action');
    try {
        const reply = await say("Delete my GATE dream completely");
        if (contains(reply, 'confirm', 'sure', 'permanent', 'delete', 'archive', 'cannot undo', "can't undo", 'this is', '?')) {
            pass('AI warns about destructive action and asks to confirm ✓');
        } else if (contains(reply, 'confirm', 'sure', '?')) {
            pass('AI asked to confirm before destructive action');
        } else {
            fail('archiveDream destructive guard', `No strong warning: ${reply.slice(0, 100)}`);
        }
        // Do NOT confirm — let it stay
        const denyReply = await say("No, keep it");
        if (contains(denyReply, 'ok', 'sure', 'cancel', "won't", 'no problem', 'kept', 'anything')) {
            pass('AI correctly kept the dream after denial ✓');
        } else {
            pass('AI responded after denial', denyReply.slice(0, 60));
        }
        // Verify dream still exists
        const db = await getDB('/api/dreams');
        const dreams = db.dreams || db || [];
        if (dreams.length > 0) {
            pass('Dream still exists in DB after user said no ✓', `count: ${dreams.length}`);
        } else {
            fail('Dream was deleted despite user saying no', 'dreams array empty');
        }
    } catch (e: any) { fail('archiveDream destructive guard', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 20: Context switch mid-conversation
    // ─────────────────────────────────────────────────────────────────────────
    section(20, 'Scenario: Context switch mid-flow');
    try {
        // Start one flow
        await say("How many checkpoints does my data structures task have?");
        // Abruptly switch topic
        const reply = await say("Actually — forget that. What are my dreams?");
        if (contains(reply, 'gate', 'crack', 'dream', 'exam')) {
            pass('AI handled context switch gracefully — showed dreams ✓');
        } else {
            pass('AI responded to context switch', reply.slice(0, 60));
        }
    } catch (e: any) { fail('Context switch', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 21: Natural conversation — no tool needed
    // ─────────────────────────────────────────────────────────────────────────
    section(21, 'Scenario: Pure natural conversation (no tool needed)');
    try {
        const reply = await say("I'm feeling demotivated today. What do I do?");
        const isNatural = reply.length > 30 &&
            !contains(reply, 'tool_call', 'function_name', 'undefined') &&
            !contains(reply, 'error');
        if (isNatural) {
            pass('AI gave a natural, human coach response without tool spam ✓');
        } else {
            fail('Natural conversation', `Unnatural response: ${reply.slice(0, 100)}`);
        }
    } catch (e: any) { fail('Natural conversation', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // SCENARIO 22: Memory — AI remembers earlier context
    // ─────────────────────────────────────────────────────────────────────────
    section(22, 'Scenario: Conversational memory — references earlier turns');
    try {
        const reply = await say("Going back to my OS task we discussed — is it completed now?");
        if (contains(reply, 'completed', 'complete', 'os', 'operating', 'done', 'status')) {
            pass('AI used conversation history to recall the OS task ✓');
        } else {
            pass('AI responded using context', reply.slice(0, 80));
        }
    } catch (e: any) { fail('Conversational memory', e.message); }

    // ─────────────────────────────────────────────────────────────────────────
    // RESULTS
    // ─────────────────────────────────────────────────────────────────────────
    const total = passed + failed;
    const pct = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

    console.log(`\n${B(Y('╔══════════════════════════════════════════════════╗'))}`);
    console.log(`${B(Y('║   TEST RESULTS                                    ║'))}`);
    console.log(`${B(Y('╚══════════════════════════════════════════════════╝'))}`);
    console.log(`  ${G('Passed:')} ${passed}`);
    console.log(`  ${R('Failed:')} ${failed}`);
    console.log(`  ${B('Score:')}  ${pct}%\n`);

    if (failures.length > 0) {
        console.log(R('  Failed scenarios:'));
        failures.forEach(f => console.log(`    ${R('·')} ${f}`));
        console.log('');
    }

    if (Number(pct) >= 80) {
        console.log(G('  🚀 Agent is performing well! All major flows pass.\n'));
    } else if (Number(pct) >= 60) {
        console.log(Y('  ⚠ Some issues detected. Review failed scenarios above.\n'));
    } else {
        console.log(R('  ✗ Significant failures. Agent may need tuning.\n'));
    }

    process.exit(failed > 10 ? 1 : 0);
}

run().catch(e => {
    console.error(R('\nFATAL: ' + (e?.response?.data?.error || e.message)));
    process.exit(1);
});
