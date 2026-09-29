import { describe, it, expect } from 'vitest';
import { resolveDatePhrase, normalizeDateArgs, toISODate, addDays } from './dateGrounding';

// Wednesday 2026-09-30, local time.
const NOW = new Date(2026, 8, 30);

describe('toISODate', () => {
    it('formats using local time, not UTC', () => {
        // 23:30 local on the 30th must stay the 30th.
        const lateNight = new Date(2026, 8, 30, 23, 30);
        expect(toISODate(lateNight)).toBe('2026-09-30');

        // 00:30 local on the 1st must stay the 1st.
        const earlyMorning = new Date(2026, 8, 1, 0, 30);
        expect(toISODate(earlyMorning)).toBe('2026-09-01');
    });
});

describe('addDays', () => {
    it('crosses month boundaries', () => {
        expect(addDays(NOW, 5)).toBe('2026-10-05');
    });

    it('crosses year boundaries', () => {
        const dec31 = new Date(2026, 11, 31);
        expect(addDays(dec31, 1)).toBe('2027-01-01');
    });

    it('handles leap years', () => {
        expect(addDays(new Date(2028, 1, 28), 1)).toBe('2028-02-29');
    });
});

describe('resolveDatePhrase', () => {
    it('resolves relative keywords', () => {
        expect(resolveDatePhrase('today', NOW)).toBe('2026-09-30');
        expect(resolveDatePhrase('tomorrow', NOW)).toBe('2026-10-01');
        expect(resolveDatePhrase('day after tomorrow', NOW)).toBe('2026-10-02');
    });

    it('resolves weekdays to the next occurrence', () => {
        // NOW is Wednesday. Friday is 2 days out.
        expect(resolveDatePhrase('friday', NOW)).toBe('2026-10-02');
        expect(resolveDatePhrase('sunday', NOW)).toBe('2026-10-04');
        // Monday already passed this week → next Monday.
        expect(resolveDatePhrase('monday', NOW)).toBe('2026-10-05');
    });

    it('handles "next friday" even when today is Friday', () => {
        const friday = new Date(2026, 9, 2);
        expect(resolveDatePhrase('friday', friday)).toBe('2026-10-02');
        expect(resolveDatePhrase('next friday', friday)).toBe('2026-10-09');
    });

    it('tolerates trailing words on a weekday', () => {
        expect(resolveDatePhrase('friday evening', NOW)).toBe('2026-10-02');
        expect(resolveDatePhrase('on friday', NOW)).toBe('2026-10-02');
    });

    it('resolves end-of period phrases', () => {
        expect(resolveDatePhrase('end of month', NOW)).toBe('2026-09-30');
        expect(resolveDatePhrase('eom', NOW)).toBe('2026-09-30');
        expect(resolveDatePhrase('end of the month', NOW)).toBe('2026-09-30');
        // Wednesday → the following Sunday.
        expect(resolveDatePhrase('end of week', NOW)).toBe('2026-10-04');
        expect(resolveDatePhrase('end of year', NOW)).toBe('2026-12-31');
    });

    it('resolves end of month for a 31-day month', () => {
        expect(resolveDatePhrase('end of month', new Date(2026, 0, 15))).toBe('2026-01-31');
        expect(resolveDatePhrase('end of month', new Date(2026, 1, 15))).toBe('2026-02-28');
    });

    it('passes explicit ISO dates through', () => {
        expect(resolveDatePhrase('2026-12-25', NOW)).toBe('2026-12-25');
    });

    it('resolves DD/MM/YYYY', () => {
        expect(resolveDatePhrase('05/10/2026', NOW)).toBe('2026-10-05');
    });

    it('rejects impossible dates rather than rolling them over', () => {
        // 2026-02-31 would silently become 2026-03-03 via the Date constructor.
        expect(resolveDatePhrase('2026-02-31', NOW)).toBeNull();
        expect(resolveDatePhrase('2026-13-01', NOW)).toBeNull();
    });

    it('resolves named months with a day', () => {
        expect(resolveDatePhrase('13 may 2027', NOW)).toBe('2027-05-13');
        expect(resolveDatePhrase('december 25', NOW)).toBe('2026-12-25');
    });

    it('resolves a bare month name to the 1st of an upcoming month', () => {
        expect(resolveDatePhrase('november', NOW)).toBe('2026-11-01');
    });

    it('returns null for non-dates', () => {
        expect(resolveDatePhrase('high priority', NOW)).toBeNull();
        expect(resolveDatePhrase('', NOW)).toBeNull();
        expect(resolveDatePhrase(null, NOW)).toBeNull();
        expect(resolveDatePhrase(undefined, NOW)).toBeNull();
        expect(resolveDatePhrase(12345, NOW)).toBeNull();
    });

    it('never returns a date in the past for relative phrases', () => {
        const phrases = ['friday', 'monday', 'next week', 'tomorrow', 'end of the week'];
        for (const p of phrases) {
            const r = resolveDatePhrase(p, NOW);
            expect(r).not.toBeNull();
            expect(r! >= toISODate(NOW)).toBe(true);
        }
    });
});

describe('normalizeDateArgs', () => {
    it('normalises every known date field', () => {
        const args = {
            title: 'Study DSA',
            deadline: 'next friday',
            startDate: 'tomorrow',
            weekStart: '2026-09-28',
        };
        const out = normalizeDateArgs(args, NOW);
        expect(out.deadline).toBe('2026-10-02');
        expect(out.startDate).toBe('2026-10-01');
        expect(out.weekStart).toBe('2026-09-28');
    });

    it('leaves non-date fields untouched', () => {
        const out = normalizeDateArgs({ title: 'x', priority: 3, dreamId: 'abc' }, NOW);
        expect(out).toEqual({ title: 'x', priority: 3, dreamId: 'abc' });
    });

    it('drops unparseable date values instead of persisting garbage', () => {
        const out = normalizeDateArgs({ title: 'x', deadline: 'sometime soon' }, NOW);
        expect(out).toEqual({ title: 'x' });
        expect('deadline' in out).toBe(false);
    });

    it('normalises targetDate inside checkpoint arrays', () => {
        const out = normalizeDateArgs({
            title: 'Build',
            checkpoints: [
                { title: 'Design', targetDate: 'next friday', orderIndex: 0 },
                { title: 'Ship', targetDate: 'garbage', orderIndex: 1 },
            ],
        }, NOW);
        expect(out.checkpoints[0].targetDate).toBe('2026-10-02');
        expect('targetDate' in out.checkpoints[1]).toBe(false);
    });

    it('does not choke on a non-object args bag', () => {
        expect(() => normalizeDateArgs({}, NOW)).not.toThrow();
        expect(() => normalizeDateArgs({ checkpoints: [] }, NOW)).not.toThrow();
    });
});
