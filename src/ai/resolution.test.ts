import { describe, it, expect } from 'vitest';
import { stripInternalKeys, buildDisambiguationContext, type ResolutionMeta } from './resolution';

describe('stripInternalKeys', () => {
    it('removes resolver-internal keys and keeps tool arguments', () => {
        const merged = {
            dreamId: 'd-uuid',
            taskId: 't-uuid',
            title: 'Ship payments',
            _dreamTitle: 'AgroNexus',
            _taskTitle: 'Stripe API',
            _dreamChoices: [{ id: 'a', title: 'Fitness App' }],
            _taskChoices: [{ id: 'b', title: 'Backend API' }],
        };

        const clean = stripInternalKeys(merged);

        expect(clean).toEqual({ dreamId: 'd-uuid', taskId: 't-uuid', title: 'Ship payments' });
    });

    it('strips leftovers from a pre-split ActionSession row so they cannot reach executeTool', () => {
        // Simulates collectedFields persisted before args/meta were separated.
        const legacySession = { taskId: 't-1', delta: 10, _taskChoices: [{ id: 'x', title: 'Other task' }] };

        const clean = stripInternalKeys(legacySession);

        expect('_taskChoices' in clean).toBe(false);
        expect(clean).toEqual({ taskId: 't-1', delta: 10 });
    });

    it('preserves falsy and undefined values so missing-field detection still works', () => {
        // dreamId: undefined is how the resolver signals "ambiguous, ask the user".
        // It must survive stripping, or the field stops landing in missingFields.
        const clean = stripInternalKeys({ dreamId: undefined, progress: 0, note: '' });

        expect('dreamId' in clean).toBe(true);
        expect(clean.dreamId).toBeUndefined();
        expect(clean.progress).toBe(0);
        expect(clean.note).toBe('');
    });

    it('returns an empty object unchanged', () => {
        expect(stripInternalKeys({})).toEqual({});
    });
});

describe('buildDisambiguationContext', () => {
    const meta: ResolutionMeta = {
        dreamChoices: [
            { id: 'd1', title: 'Fitness App' },
            { id: 'd2', title: 'Fitness Transformation' },
        ],
        taskChoices: [
            { id: 't1', title: 'Backend API' },
            { id: 't2', title: 'Backend Testing' },
        ],
    };

    it('renders a numbered dream list when dreamId is the missing field', () => {
        const out = buildDisambiguationContext('dreamId', meta);

        expect(out).toContain('Multiple dreams were found');
        expect(out).toContain('1. Fitness App');
        expect(out).toContain('2. Fitness Transformation');
    });

    it('renders a numbered task list when taskId is the missing field', () => {
        const out = buildDisambiguationContext('taskId', meta);

        expect(out).toContain('Multiple tasks were found');
        expect(out).toContain('1. Backend API');
        expect(out).toContain('2. Backend Testing');
    });

    it('never exposes internal UUIDs to the prompt', () => {
        const out = buildDisambiguationContext('dreamId', meta);

        expect(out).not.toContain('d1');
        expect(out).not.toContain('d2');
    });

    it('returns empty string when there are no candidates for that field', () => {
        expect(buildDisambiguationContext('dreamId', {})).toBe('');
        expect(buildDisambiguationContext('taskId', {})).toBe('');
        expect(buildDisambiguationContext('dreamId', { dreamChoices: [] })).toBe('');
    });

    it('returns empty string for a field that is not an entity reference', () => {
        expect(buildDisambiguationContext('deadline', meta)).toBe('');
        expect(buildDisambiguationContext('priority', meta)).toBe('');
    });
});
