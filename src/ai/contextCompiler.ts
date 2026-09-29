// src/ai/contextCompiler.ts
// ─────────────────────────────────────────────────────────────────────────────
// Context Compiler: Structures LLM input into distinct, typed authority tiers:
//   Tier 1: Absolute Truth (PostgreSQL State Snapshot)
//   Tier 2: Learned Memory & Reflections (Hindsight Recall)
//   Tier 3: Dialogue Utterance & History
// ─────────────────────────────────────────────────────────────────────────────

import { buildUserContext } from './contextBuilder';
import { hindsightService, MemoryItem } from './hindsightService';

export interface CompiledContext {
    systemPrompt: string;
    tier1State: any;
    tier2Memories: MemoryItem[];
}

export async function compileContext(
    token: string,
    userId: string,
    userMessage: string
): Promise<CompiledContext> {
    // 1. Fetch Tier 1 Ground Truth from DB via contextBuilder
    const contextData = await buildUserContext(token, userId);
    
    // 2. Fetch Tier 2 Memories from Hindsight Engine
    const tier2Memories = await hindsightService.recall({
        userId,
        query: userMessage,
        topK: 3,
    });

    const memoryLines = tier2Memories.map(m => `• [${m.eventType}] ${m.content}`);

    // 3. Assemble Tiered System Prompt
    const systemPrompt = `You are IgniteMate, an AI goal achievement coach.

=== TIER 1: AUTHORITATIVE STATE (GROUND TRUTH - DO NOT HALLUCINATE) ===
User Name: ${contextData.name || contextData.preferredName || 'Friend'}
Agent Name: ${contextData.agentName || 'IgniteMate'}
Motivation Tone: ${contextData.motivationTone}

Current Database State Context:
${contextData.contextBlock}

=== TIER 2: LEARNED USER MEMORIES & REFLECTIONS (HINDSIGHT GUIDANCE) ===
${memoryLines.length > 0 ? memoryLines.join('\n') : '(No specific past behavioral memories recalled for this turn)'}

RULES:
1. You must ONLY reference entity titles or IDs that exist in TIER 1.
2. Use TIER 2 memories to adapt your tone, task sizing, and deadline suggestions naturally.
3. If an action is requested, return valid JSON args for the appropriate tool.`;

    return {
        systemPrompt,
        tier1State: contextData,
        tier2Memories,
    };
}
