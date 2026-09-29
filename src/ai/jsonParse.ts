// src/ai/jsonParse.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tolerant JSON extraction for LLM output.
//
// A reasoning model asked for "JSON only" will still occasionally emit a
// ```json fence, a "Sure, here you go:" preamble, a trailing comma, or a
// truncated final object when it runs out of output budget. Every one of those
// used to reach a bare `JSON.parse(rawText)` and throw — turning a normal chat
// turn into a 500.
//
// Everything here is pure and side-effect free so it can be unit tested.
// ─────────────────────────────────────────────────────────────────────────────

/** Strip markdown code fences, keeping the inner text. */
function stripCodeFences(raw: string): string {
    const fence = raw.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)(?:\n?```|$)/);
    return fence ? fence[1] : raw;
}

/**
 * Scan for every balanced {...} / [...] region, ignoring braces that sit
 * inside string literals.
 *
 * Returns all of them, not just the first: prose like `I think {this} is
 * right, so: {"intent":"CHAT"}` has a decoy brace group before the real JSON,
 * and stopping at the first one would throw away the answer.
 */
function extractBalancedRegions(text: string): string[] {
    const openers: Record<string, string> = { '{': '}', '[': ']' };
    const found: string[] = [];
    let i = 0;

    while (i < text.length) {
        const opener = text[i];
        if (!openers[opener]) { i++; continue; }

        const closer = openers[opener];
        let depth = 0;
        let inString = false;
        let escaped = false;
        let closedAt = -1;

        for (let j = i; j < text.length; j++) {
            const ch = text[j];

            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;

            if (ch === opener) depth++;
            else if (ch === closer) {
                depth--;
                if (depth === 0) { closedAt = j; break; }
            }
        }

        if (closedAt === -1) break;   // unterminated — the repair pass handles it

        found.push(text.slice(i, closedAt + 1));
        i = closedAt + 1;
    }

    return found;
}

/** Remove trailing commas before a closing brace/bracket: `{"a":1,}` → `{"a":1}`. */
function stripTrailingCommas(text: string): string {
    return text.replace(/,\s*([}\]])/g, '$1');
}

/** Quote bare keys so `{a: 1}` parses: `{a: 1}` → `{"a": 1}`. */
function quoteBareKeys(text: string): string {
    return text.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
}

/**
 * Parse JSON out of arbitrary LLM output.
 *
 * Never throws. Returns `fallback` (default `{}`) when nothing parseable is
 * found, so callers can treat a failed extraction as "no fields extracted"
 * rather than crashing the turn.
 */
export function safeJsonParse<T = any>(raw: string | null | undefined, fallback: T = {} as T): T {
    if (typeof raw !== 'string' || raw.trim().length === 0) return fallback;

    // Attempt 1 — the common case: the model behaved.
    try {
        return JSON.parse(raw) as T;
    } catch { /* keep going */ }

    const unfenced = stripCodeFences(raw);

    // Attempt 2 — fenced block.
    try {
        return JSON.parse(unfenced) as T;
    } catch { /* keep going */ }

    // Attempt 3 — every balanced object/array embedded in prose. Earlier
    // regions may be decoys, so we try them all.
    for (const region of extractBalancedRegions(unfenced)) {
        try {
            return JSON.parse(region) as T;
        } catch { /* keep going */ }

        // Attempt 4 — tolerate trailing commas and bare keys.
        try {
            return JSON.parse(quoteBareKeys(stripTrailingCommas(region))) as T;
        } catch { /* keep going */ }
    }

    // Attempt 5 — the model emitted an unterminated object before hitting its
    // output cap. Close the open containers and retry; we get the prefix of the
    // object, which is usually the fields we needed.
    const repaired = closeOpenContainers(unfenced);
    if (repaired) {
        try {
            return JSON.parse(quoteBareKeys(stripTrailingCommas(repaired))) as T;
        } catch { /* give up */ }
    }

    return fallback;
}

/** Append the closers needed to balance a truncated JSON fragment. */
function closeOpenContainers(text: string): string | null {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    let stringStart = -1;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') {
            inString = !inString;
            stringStart = inString ? i : -1;
            continue;
        }
        if (inString) continue;

        if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') stack.pop();
    }

    // Track where the open string began. If the model was cut off mid-string,
    // the fragment is almost always a half-typed key (`...,"prio`) whose value
    // never arrived. Keeping it would leave the object unparseable even after
    // we close the container, so we truncate back to the quote.
    let base = text;
    if (inString && stringStart >= 0) {
        base = base.slice(0, stringStart);
    }
    if (stack.length === 0) return null;

    // Drop any remaining dangling fragment with no value: `,"key":` or a
    // half-typed `,prio`. Do NOT strip a bare trailing `"` — at this point any
    // unterminated string was already truncated away above, and a trailing
    // quote here is a legitimate string closer.
    base = base.trimEnd();
    base = base.replace(/,?\s*"[^"]*"\s*:\s*$/, '');       // dangling quoted key
    base = base.replace(/,?\s*[A-Za-z_$][\w$]*\s*$/, '');   // dangling bare key
    base = base.replace(/,\s*$/, '');
    if (base.length === 0) return null;

    let out = base;
    for (let i = stack.length - 1; i >= 0; i--) {
        out += stack[i] === '{' ? '}' : ']';
    }
    return out;
}

/**
 * Tool-call arguments arrive as a JSON *string* inside `function.arguments`.
 * This parses defensively and returns `{}` rather than throwing, because a
 * malformed argument blob must never abort the whole agent turn.
 */
export function parseToolArguments(argBlob: unknown): Record<string, any> {
    if (argBlob && typeof argBlob === 'object') return argBlob as Record<string, any>;
    return safeJsonParse<Record<string, any>>(argBlob as string, {});
}
