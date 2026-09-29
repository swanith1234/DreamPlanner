import { describe, it, expect } from 'vitest';
import { safeJsonParse, parseToolArguments } from './jsonParse';

describe('safeJsonParse', () => {
    it('parses clean JSON', () => {
        expect(safeJsonParse('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
    });

    it('parses JSON wrapped in a markdown fence', () => {
        const raw = '```json\n{"title":"DSA sheet","priority":3}\n```';
        expect(safeJsonParse(raw)).toEqual({ title: 'DSA sheet', priority: 3 });
    });

    it('parses JSON wrapped in an unlabelled fence', () => {
        expect(safeJsonParse('```\n{"ok":true}\n```')).toEqual({ ok: true });
    });

    it('parses an unterminated fence', () => {
        expect(safeJsonParse('```json\n{"ok":true}')).toEqual({ ok: true });
    });

    it('extracts JSON from a prose preamble', () => {
        const raw = 'Sure! Here is the result:\n{"intent":"ACTION","complexity":"SIMPLE"}\nHope that helps!';
        expect(safeJsonParse(raw)).toEqual({ intent: 'ACTION', complexity: 'SIMPLE' });
    });

    it('handles prose containing braces before the real JSON', () => {
        const raw = 'I think {this} is right, so: {"intent":"CHAT"}';
        expect(safeJsonParse(raw)).toEqual({ intent: 'CHAT' });
    });

    it('does not count braces inside string literals', () => {
        const raw = 'prefix {"note":"a } brace { inside","v":1} suffix';
        expect(safeJsonParse(raw)).toEqual({ note: 'a } brace { inside', v: 1 });
    });

    it('handles escaped quotes inside strings', () => {
        const raw = '{"quote":"she said \\"hi\\" loudly","n":2}';
        expect(safeJsonParse(raw)).toEqual({ quote: 'she said "hi" loudly', n: 2 });
    });

    it('repairs trailing commas', () => {
        expect(safeJsonParse('{"a":1,}')).toEqual({ a: 1 });
        expect(safeJsonParse('{"a":[1,2,],}')).toEqual({ a: [1, 2] });
    });

    it('quotes bare keys', () => {
        expect(safeJsonParse('{a:1,b:"x"}')).toEqual({ a: 1, b: 'x' });
    });

    it('repairs output truncated mid-object', () => {
        // A reasoning model that hit its output cap mid-write.
        const raw = '{"title":"Build a compiler","deadline":"2026-11-01","priority":4';
        expect(safeJsonParse(raw)).toEqual({ title: 'Build a compiler', deadline: '2026-11-01', priority: 4 });
    });

    it('repairs a truncated object with a dangling key', () => {
        const raw = '{"title":"Build","prio';
        expect(safeJsonParse(raw)).toEqual({ title: 'Build' });
    });

    it('repairs a truncated array', () => {
        // A truncated string element is closed rather than dropped.
        expect(safeJsonParse('["a","b","c"')).toEqual(['a', 'b', 'c']);
        // Cut off right after a comma.
        expect(safeJsonParse('["a","b",')).toEqual(['a', 'b']);
    });

    it('returns the fallback for unparseable input', () => {
        expect(safeJsonParse('no json here at all')).toEqual({});
        expect(safeJsonParse('no json here', { fallback: true } as any)).toEqual({ fallback: true });
    });

    it('returns the fallback for empty / null / undefined input', () => {
        expect(safeJsonParse('')).toEqual({});
        expect(safeJsonParse('   ')).toEqual({});
        expect(safeJsonParse(null)).toEqual({});
        expect(safeJsonParse(undefined)).toEqual({});
    });

    it('never throws', () => {
        const nasty = ['{', '}', '[', ']', '{"a":', '```json', '{{{{{{', ']]]]]]', '"unterminated', '{"a":"\\'];
        for (const raw of nasty) {
            expect(() => safeJsonParse(raw)).not.toThrow();
        }
    });
});

describe('parseToolArguments', () => {
    it('parses the JSON string the model puts in function.arguments', () => {
        expect(parseToolArguments('{"status":"PENDING"}')).toEqual({ status: 'PENDING' });
    });

    it('passes an already-parsed object straight through', () => {
        expect(parseToolArguments({ status: 'PENDING' })).toEqual({ status: 'PENDING' });
    });

    it('returns {} for garbage instead of throwing', () => {
        expect(parseToolArguments('not json')).toEqual({});
        expect(parseToolArguments(undefined)).toEqual({});
        expect(parseToolArguments(null)).toEqual({});
    });

    it('tolerates the truncated argument blobs models sometimes emit', () => {
        expect(parseToolArguments('{"taskId":"abc-123","priority":2')).toEqual({ taskId: 'abc-123', priority: 2 });
    });
});
