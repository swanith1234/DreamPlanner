// Live smoke test: does space-bunny-free actually drive the agent loop?
// Run: npx tsx src/scripts/live_agent_check.ts
import { executeWithFallback } from '../ai/llmClient';
import { buildSystemPrompt } from '../ai/systemPrompt';
import { TOOLS } from '../ai/tools';
import { isWriteTool, toolLabel } from '../ai/toolGuards';
import { parseToolArguments } from '../ai/jsonParse';

const CONTEXT = `
USER_IDENTITY:
You ARE: Nova
Address user as: Swanith
Tone: LOGICAL
Date: ${new Date().toLocaleDateString('en-IN')}

ACTIVE_DREAMS:
• Build an AI agent (ID: 8f3c2a1b)

PENDING_TASKS:
• Finish DSA sheet 200 [PENDING]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const SYSTEM = buildSystemPrompt(CONTEXT, 'LOGICAL', 'Swanith');

const FAKE_RESULTS: Record<string, any> = {
    listTasks: [{ id: '11111111-2222-3333-4444-555555555555', title: 'Finish DSA sheet 200', status: 'PENDING', priority: 2, deadline: '2026-10-04' }],
    searchTasks: [{ id: '11111111-2222-3333-4444-555555555555', title: 'Finish DSA sheet 200', status: 'PENDING' }],
    getDashboard: { disciplineScore: 82, consistency: 0.78, behavioralState: 'LOCKED_IN' },
    getPreferences: { motivationTone: 'LOGICAL', notificationFrequency: 60, sleepStart: '22:00' },
    listDreams: [{ id: '8f3c2a1b-0000-0000-0000-000000000000', title: 'Build an AI agent', status: 'ACTIVE' }],
};

async function turn(userMessage: string, label: string) {
    console.log('\n' + '═'.repeat(72));
    console.log(`▶ ${label}`);
    console.log(`  user: "${userMessage}"`);

    const messages: any[] = [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMessage },
    ];

    for (let i = 0; i < 4; i++) {
        const res: any = await executeWithFallback(messages, { complexity: 'SIMPLE', tools: TOOLS as any, max_tokens: 1024 }, i + 1);
        const msg = res.choices[0].message;
        const calls = msg.tool_calls ?? [];

        if (calls.length === 0) {
            console.log(`  ✓ final reply: ${JSON.stringify((msg.content ?? '').slice(0, 220))}`);
            return { gated: false };
        }

        for (const c of calls) {
            const name = c.function.name;
            const args = parseToolArguments(c.function.arguments);
            const write = isWriteTool(name);
            console.log(`  → tool: ${name} ${write ? '[WRITE → would be GATED]' : '[READ → auto-exec]'}`);
            console.log(`    args: ${JSON.stringify(args)}`);

            messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });

            if (write) {
                console.log(`  🛑 WRITE GATE: would show "about to ${toolLabel(name)}" + confirm prompt`);
                return { gated: true, name, args };
            }

            const result = FAKE_RESULTS[name] ?? { error: `no fake data for ${name}` };
            console.log(`    result: ${JSON.stringify(result).slice(0, 140)}`);
            messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
        }
    }
    return { gated: false };
}

async function main() {
    const t0 = Date.now();

    // 1. Read query — must call a tool, must NOT invent data.
    await turn('what are my pending tasks?', 'READ — should call listTasks');

    // 2. Second turn, feeding results back — must not re-call forever.
    await turn('how is my discipline score looking this week?', 'READ — should call getDashboard');

    // 3. Write query — must be gated, never auto-executed.
    await turn('delete my DSA sheet task', 'WRITE — must be gated for confirmation');

    // 4. Pure chat — must answer without calling tools.
    await turn('thanks, that all makes sense', 'CHAT — no tool expected');

    console.log('\n' + '═'.repeat(72));
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
