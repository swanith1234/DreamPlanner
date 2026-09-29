/**
 * Entity-resolution result types and pure helpers.
 *
 * Split out of orchestrator.ts so the invariant these encode — resolver metadata
 * must never travel inside tool arguments — can be unit tested without booting a
 * PrismaClient, the LLM provider clients, or the embeddings pipeline.
 */

/** Presentation / ambiguity data produced while resolving names to IDs. */
export interface ResolutionMeta {
    dreamTitle?: string;
    taskTitle?: string;
    dreamChoices?: Array<{ id: string; title: string }>;
    taskChoices?: Array<{ id: string; title: string }>;
}

export interface ResolvedEntities {
    /** Tool-safe arguments — the ONLY object allowed to reach executeTool(). */
    args: Record<string, any>;
    /** Presentation-only resolution data — never sent downstream. */
    meta: ResolutionMeta;
}

/**
 * Drop resolver-internal `_`-prefixed keys.
 *
 * Defensive on two fronts:
 *  - ActionSession rows written before the args/meta split may still carry
 *    `_dreamChoices` / `_taskTitle` in collectedFields; resuming such a session
 *    must not resurrect them into a tool call.
 *  - An LLM extraction pass could echo an underscore-prefixed key back to us.
 */
export function stripInternalKeys(args: Record<string, any>): Record<string, any> {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(args)) {
        if (!key.startsWith('_')) clean[key] = value;
    }
    return clean;
}

/**
 * Build the numbered disambiguation hint for the next missing field.
 *
 * Reads from `meta` only — candidate lists must never be sourced from tool
 * arguments, which is what allowed a user's whole dream list to reach both an
 * outbound HTTP body and the confirmation bubble.
 *
 * Returns '' when there is nothing to disambiguate.
 */
export function buildDisambiguationContext(nextMissing: string, meta: ResolutionMeta): string {
    const candidates =
        nextMissing === 'dreamId' ? meta.dreamChoices :
        nextMissing === 'taskId' ? meta.taskChoices :
        undefined;

    if (!candidates || candidates.length === 0) return '';

    const label = nextMissing === 'dreamId' ? 'dreams' : 'tasks';
    return `NOTE: Multiple ${label} were found. Ask the user to pick one from this list:\n` +
        candidates.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
}
