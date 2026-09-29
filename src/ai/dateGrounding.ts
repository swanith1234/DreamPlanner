// src/ai/dateGrounding.ts
// ─────────────────────────────────────────────────────────────────────────────
// Turns the date-ish strings an LLM produces into the exact `YYYY-MM-DD` the
// database stores.
//
// The problem: the model is asked to normalise "next friday" / "end of the
// month" and has no reliable clock, so it guesses — and the guess can be a day
// or two off, or land in the past. Worse, "2026-05-13" parsed as a JS `Date`
// becomes midnight **UTC**, which in IST is already 5:30am the same day and in
// US timezones is the *previous* day.
//
// Everything here is pure so it can be unit tested.
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
];

const WEEKDAYS = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/** Local (not UTC) YYYY-MM-DD. Avoids the off-by-one-day bug entirely. */
export function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Local YYYY-MM-DD for N days from today. */
export function addDays(base: Date, days: number): string {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return toISODate(d);
}

/** Build a date only if the components are a real calendar date. */
function normalizeParts(year: number, month: number, day: number): string | null {
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const d = new Date(year, month - 1, day);
    // Reject overflow: 2026-02-31 would otherwise silently become March 3rd.
    if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;

    return toISODate(d);
}

/** Resolve `YYYY-MM-DD` / `DD-MM-YYYY` / `DD/MM/YYYY` unambiguously to ISO. */
function parseExplicit(raw: string): string | null {
    let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return normalizeParts(+m[1], +m[2], +m[3]);

    // Ambiguous slash/dash forms are read as DD/MM/YYYY (matches the app's locale).
    m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (m) return normalizeParts(+m[3], +m[2], +m[1]);

    return null;
}

/**
 * Normalise any date phrase the model emitted into `YYYY-MM-DD`.
 *
 * Returns `null` when the phrase genuinely isn't a date, so the caller can
 * leave the field out rather than persisting a guess.
 */
export function resolveDatePhrase(
    phrase: unknown,
    now: Date = new Date(),
): string | null {
    if (phrase === null || phrase === undefined) return null;

    // Numbers are assumed to already be epoch millis or a year — leave alone.
    if (typeof phrase !== 'string') return null;

    const raw = phrase.trim().toLowerCase();
    if (!raw) return null;

    if (raw === 'today' || raw === 'tonight') return toISODate(now);
    if (raw === 'tomorrow') return addDays(now, 1);
    if (raw === 'day after tomorrow') return addDays(now, 2);
    if (raw === 'yesterday') return addDays(now, -1);
    if (raw === 'next week') return addDays(now, 7);
    if (raw === 'next month') {
        const d = new Date(now);
        d.setMonth(d.getMonth() + 1);
        return toISODate(d);
    }

    const explicit = parseExplicit(raw);
    if (explicit) return explicit;

    if (raw === 'eow' || raw === 'end of week' || raw === 'end of the week') {
        return endOfWeek(now);
    }
    if (raw === 'eom' || raw === 'end of month' || raw === 'end of the month') {
        return endOfMonth(now);
    }
    if (raw === 'eoy' || raw === 'end of year' || raw === 'end of the year') {
        return `${now.getFullYear()}-12-31`;
    }

    // "friday", "next friday", "this friday", "friday evening"
    const wd = matchWeekday(raw, now);
    if (wd) return wd;

    // "13 may 2026" / "may 13"
    const named = matchNamedMonth(raw, now);
    if (named) return named;

    return null;
}

function matchWeekday(raw: string, now: Date): string | null {
    const hit = WEEKDAYS.findIndex(d => raw.includes(d));
    if (hit === -1) return null;

    const current = now.getDay();
    const isNext = /\bnext\s/.test(raw);

    // 0 = today, otherwise 1..6 days until that weekday.
    let delta = (hit - current + 7) % 7;

    // "next friday" on a Wednesday still means this coming Friday (2 days) —
    // it only pushes a full week when today *is* that weekday. Getting this
    // wrong silently turned every "due next friday" into a date 7 days late.
    if (isNext && delta === 0) delta = 7;

    return addDays(now, delta);
}

function matchNamedMonth(raw: string, now: Date): string | null {
    const monthIdx = MONTHS.findIndex(m => raw.includes(m));
    if (monthIdx === -1) return null;

    const dayMatch = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    const yearMatch = raw.match(/\b(20\d{2})\b/);
    const year = yearMatch ? +yearMatch[1] : now.getFullYear();

    // "november" with no day → the 1st of an upcoming month.
    if (!dayMatch) {
        const d = new Date(year, monthIdx, 1);
        if (d < now && year === now.getFullYear()) d.setFullYear(year + 1);
        return toISODate(d);
    }

    return normalizeParts(year, monthIdx + 1, +dayMatch[1]);
}

function endOfWeek(now: Date): string {
    const d = new Date(now);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return toISODate(d);
}

function endOfMonth(now: Date): string {
    return toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/** Date field names that should be normalised when they appear in tool args. */
const DATE_FIELDS = new Set([
    'deadline', 'startDate', 'targetDate', 'weekStart', 'localDate', 'date',
    'dueDate', 'miniDeadline',
]);

/**
 * Walk a tool-args object and normalise every date-ish field.
 * Unknown/unparseable values are deleted so they never reach the database as
 * garbage.
 */
export function normalizeDateArgs<T extends Record<string, any>>(
    args: T,
    now: Date = new Date(),
): T {
    const out = args as Record<string, any>;

    for (const [key, value] of Object.entries(out)) {
        // Nested date fields: `checkpoints: [{ targetDate: 'next friday' }]`.
        // Handled regardless of the key name, because the array is data, not a
        // date itself.
        if (Array.isArray(value)) {
            const hasNestedDate = value.some(
                (item: any) => item && typeof item === 'object' && 'targetDate' in item,
            );
            if (hasNestedDate) {
                out[key] = value.map((item: any) => {
                    if (item && typeof item === 'object' && 'targetDate' in item) {
                        const d = resolveDatePhrase(item.targetDate, now);
                        if (d) item.targetDate = d;
                        else delete item.targetDate;
                    }
                    return item;
                });
            }
            continue;
        }

        if (!DATE_FIELDS.has(key)) continue;

        const resolved = resolveDatePhrase(value, now);
        if (resolved) {
            out[key] = resolved;
        } else {
            delete out[key];
        }
    }
    return out as T;
}

/** Back-compat alias — the notification pipeline used the older name. */
export const resolveDateFields = normalizeDateArgs;
