// src/ai/orchestrator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Main AI pipeline coordinator. This is the only entry point from the chat
// controller. It coordinates all other AI modules in the exact sequence:
//
// Redis Draft Check → Intent Detector → Parameter Extractor → Zod Validation
// → Context Builder → Confirmation Gate → API Adapter → Response Generator
//
// SAFETY RULES:
// 1. Never calls services or Prisma directly — only via apiAdapter.
// 2. On API errors, keeps draft alive and surfaces the error to the user.
// 3. All LLM outputs are Zod-validated before being used or saved to draft.
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import { groq, GROQ_MODEL } from '../config/ai';
import { logger } from '../utils/logger';
import { INTENT_REGISTRY, IntentName, MODES } from './registry/intentRegistry';
import { TaskCheckpointArraySchema, DreamCheckpointArraySchema } from './schemas/checkpointSchema';
import { redisDraftManager, ChatDraft } from './redisDraftManager';
import { contextBuilder } from './contextBuilder';
import { intentDetector } from './intentDetector';
import { parameterExtractor } from './parameterExtractor';
import { responseGenerator, ChatResponse } from './responseGenerator';
import { taskApi } from '../apiAdapter/taskApi';
import { dreamApi } from '../apiAdapter/dreamApi';
import { analyticsApi } from '../apiAdapter/analyticsApi';
import { userApi } from '../apiAdapter/userApi';
import { notificationApi } from '../apiAdapter/notificationApi';

export interface OrchestratorInput {
    userId: string;
    message: string;
    token: string; // JWT access token forwarded from the chat controller
}

export const orchestrator = {

    async process(input: OrchestratorInput): Promise<ChatResponse> {
        const { userId, message, token } = input;

        // ── 1. Build context (Tier 1 cached, Tier 2 history) ─────────────────────
        const ctx = await contextBuilder.build(userId, token);

        // ── 2. Run intentDetector ONCE — drives ALL routing decisions ─────────────
        //    Including cancel, confirm, skip, context-switch, and domain intents.
        const { mode, intent } = await intentDetector.detect(message, ctx.history);
        await contextBuilder.appendHistory(userId, { role: 'user', content: message });

        // ── 3. Check for active draft ─────────────────────────────────────────────
        const draft = await redisDraftManager.getDraft(userId);

        // ── 4. CANCEL_DRAFT — works whether a draft exists or not ─────────────────
        if (intent === 'CANCEL_DRAFT') {
            if (draft) await redisDraftManager.deleteDraft(userId);
            const resp: ChatResponse = { text: "Got it — cancelled. What would you like to do instead?", responseMode: 'CHAT' };
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
            return resp;
        }

        // ── 5. Resume active draft (pass pre-detected intent to avoid re-detection) ─
        if (draft) {
            return orchestrator._resumeDraft(draft, message, intent, mode, userId, token, ctx);
        }

        // ── 6. CHAT mode ──────────────────────────────────────────────────────────
        if (mode === MODES.CHAT || intent === 'GENERAL_CHAT') {
            const resp = await responseGenerator.generate({ responseMode: 'CHAT', userMessage: message, ctx });
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
            return resp;
        }

        // ── 7. QUERY mode ─────────────────────────────────────────────────────────
        if (mode === MODES.QUERY) {
            return orchestrator._handleQuery(intent as IntentName, message, userId, token, ctx);
        }

        // ── 8. ACTION mode — extract parameters ───────────────────────────────────
        const { parameters, missingFields } = await parameterExtractor.extract(
            intent as IntentName, message, ctx, {}
        );

        if (missingFields.length > 0) {
            const newDraft: ChatDraft = {
                intent, parameters, missingFields,
                status: 'COLLECTING_PARAMS',
                originalMessage: message,
                createdAt: Date.now(),
            };
            await redisDraftManager.saveDraft(userId, newDraft);
            const question = parameterExtractor.fieldQuestion(intent as IntentName, missingFields[0], ctx);
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: question });
            return { text: question, responseMode: 'MISSING_FIELDS' };
        }

        return orchestrator._proceedFromParams(intent as IntentName, parameters, userId, token, ctx, message);
    },

    // ── Resume an in-progress draft ───────────────────────────────────────────
    // intent and mode are pre-detected in process() to avoid a second LLM call.

    async _resumeDraft(
        draft: ChatDraft,
        message: string,
        intent: string,
        mode: string,
        userId: string,
        token: string,
        ctx: any
    ): Promise<ChatResponse> {
        // Note: message already appended to history by process()

        // ── 1. Pending abort confirmation ─────────────────────────────────────────
        if (draft.isAwaitingAbortConfirmation) {
            if (intent === 'CONFIRM_YES') {
                const pending = draft.pendingContextSwitchMessage!;
                await redisDraftManager.deleteDraft(userId);
                // Replay the pending message (it's already in history — don't re-append)
                return orchestrator._replayMessage(pending, userId, token, ctx);
            }

            if (intent === 'CONFIRM_NO') {
                await redisDraftManager.updateDraft(userId, {
                    isAwaitingAbortConfirmation: false,
                    pendingContextSwitchMessage: undefined,
                });
                const question = parameterExtractor.fieldQuestion(
                    draft.intent as IntentName,
                    draft.missingFields[0] ?? 'title',
                    ctx,
                );
                await contextBuilder.appendHistory(userId, { role: 'assistant', content: question });
                return { text: question, responseMode: 'MISSING_FIELDS' };
            }

            // Ambiguous — re-ask the abort question
            const intentDisplay = (draft.intent as string).replace(/_/g, ' ').toLowerCase();
            const re = `I still need a clear answer: do you want to **abort** "${intentDisplay}" and switch to your new request, or **continue** with it? Reply **yes** to abort or **no** to continue.`;
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: re });
            return { text: re, responseMode: 'CHAT' };
        }

        // ── 2. Awaiting checkpoint list confirmation ───────────────────────────────
        if (draft.status === 'AWAITING_CHECKPOINT_CONFIRM') {
            return orchestrator._handleCheckpointEdit(draft, message, userId, token, ctx);
        }

        // ── 3. Awaiting final confirmation gate ───────────────────────────────────
        if (draft.status === 'AWAITING_CONFIRMATION') {
            if (intent === 'CONFIRM_YES') {
                return orchestrator._execute(draft.intent as IntentName, draft.parameters, userId, token, ctx);
            }
            // User wants to amend something — re-extract
            const { parameters: p2, missingFields: mf2 } = await parameterExtractor.extract(
                draft.intent as IntentName, message, ctx, draft.parameters
            );
            if (mf2.length > 0) {
                await redisDraftManager.updateDraft(userId, { parameters: p2, missingFields: mf2, status: 'COLLECTING_PARAMS' });
                const question = parameterExtractor.fieldQuestion(draft.intent as IntentName, mf2[0], ctx);
                await contextBuilder.appendHistory(userId, { role: 'assistant', content: question });
                return { text: question, responseMode: 'MISSING_FIELDS' };
            }
            await redisDraftManager.updateDraft(userId, { parameters: p2, status: 'AWAITING_CONFIRMATION' });
            return orchestrator._proceedFromParams(draft.intent as IntentName, p2, userId, token, ctx, message);
        }

        // ── 4. COLLECTING_PARAMS — skip field ─────────────────────────────────────
        if (intent === 'SKIP_FIELD' && draft.missingFields.length > 0) {
            const skippedField = draft.missingFields[0];
            const updatedParams = { ...draft.parameters, [skippedField]: null };
            const remaining = draft.missingFields.slice(1);

            if (remaining.length > 0) {
                await redisDraftManager.updateDraft(userId, { parameters: updatedParams, missingFields: remaining });
                const question = parameterExtractor.fieldQuestion(draft.intent as IntentName, remaining[0], ctx);
                await contextBuilder.appendHistory(userId, { role: 'assistant', content: question });
                return { text: question, responseMode: 'MISSING_FIELDS' };
            }
            await redisDraftManager.updateDraft(userId, { parameters: updatedParams, missingFields: [] });
            return orchestrator._proceedFromParams(
                draft.intent as IntentName, updatedParams, userId, token, ctx, message
            );
        }

        // ── 5. COLLECTING_PARAMS — context switch detection ───────────────────────
        // System intents (CONFIRM_*, SKIP_FIELD, CANCEL_DRAFT) and GENERAL_CHAT
        // are never considered a context switch — only domain intents are.
        const SYSTEM_INTENTS = new Set(['CONFIRM_YES', 'CONFIRM_NO', 'SKIP_FIELD', 'CANCEL_DRAFT', 'GENERAL_CHAT']);
        const isNewDomainIntent =
            mode !== MODES.CHAT &&
            !SYSTEM_INTENTS.has(intent) &&
            intent !== draft.intent;

        if (isNewDomainIntent) {
            const intentDisplay = (draft.intent as string).replace(/_/g, ' ').toLowerCase();
            await redisDraftManager.updateDraft(userId, {
                isAwaitingAbortConfirmation: true,
                pendingContextSwitchMessage: message,
            });
            const replyText = `⚠️ You're currently in the middle of **${intentDisplay}**. Do you want to cancel that and handle your new request instead?\n\nReply **yes** to abort and switch, or **no** to continue with ${intentDisplay}.`;
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: replyText });
            return { text: replyText, responseMode: 'CHAT' };
        }

        // ── 6. Normal parameter extraction ───────────────────────────────────────
        const { parameters, missingFields } = await parameterExtractor.extract(
            draft.intent as IntentName, message, ctx, draft.parameters
        );

        if (missingFields.length > 0) {
            await redisDraftManager.updateDraft(userId, { parameters, missingFields });
            const question = parameterExtractor.fieldQuestion(draft.intent as IntentName, missingFields[0], ctx);
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: question });
            return { text: question, responseMode: 'MISSING_FIELDS' };
        }

        return orchestrator._proceedFromParams(
            draft.intent as IntentName, parameters, userId, token, ctx, message
        );
    },

    // ── Replay a pending context-switch message after the user aborts a draft ──
    // The pending message is already in chat history (it was appended when it
    // first arrived). We re-detect its intent fresh and process it as a new request.

    async _replayMessage(
        message: string,
        userId: string,
        token: string,
        ctx: any,
    ): Promise<ChatResponse> {
        const { mode, intent } = await intentDetector.detect(message, ctx.history);
        // Do NOT re-append message to history — it was stored on original arrival.

        if (mode === MODES.CHAT || intent === 'GENERAL_CHAT') {
            const resp = await responseGenerator.generate({ responseMode: 'CHAT', userMessage: message, ctx });
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
            return resp;
        }

        if (mode === MODES.QUERY) {
            return orchestrator._handleQuery(intent as IntentName, message, userId, token, ctx);
        }

        // ACTION — extract parameters and start a fresh draft
        const { parameters, missingFields } = await parameterExtractor.extract(
            intent as IntentName, message, ctx, {}
        );

        if (missingFields.length > 0) {
            const newDraft: ChatDraft = {
                intent, parameters, missingFields,
                status: 'COLLECTING_PARAMS',
                originalMessage: message,
                createdAt: Date.now(),
            };
            await redisDraftManager.saveDraft(userId, newDraft);
            const question = parameterExtractor.fieldQuestion(intent as IntentName, missingFields[0], ctx);
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: question });
            return { text: question, responseMode: 'MISSING_FIELDS' };
        }

        return orchestrator._proceedFromParams(intent as IntentName, parameters, userId, token, ctx, message);
    },

    // ── After all required params are filled ─────────────────────────────────

    async _proceedFromParams(
        intent: IntentName,
        parameters: Record<string, any>,
        userId: string,
        token: string,
        ctx: any,
        message: string
    ): Promise<ChatResponse> {
        const def = INTENT_REGISTRY[intent];

        // ── CREATE_TASK: if deadline > 24hrs, collect checkpoints ─────────────────
        if (intent === 'CREATE_TASK' && !parameters.checkpoints) {
            const deadlineMs = new Date(parameters.deadline).getTime();
            const hoursUntil = (deadlineMs - Date.now()) / (1000 * 60 * 60);
            if (hoursUntil > 24) {
                return orchestrator._suggestCheckpoints(parameters, userId, ctx);
            }
        }

        // ── CONFIRM_DREAM: if no checkpoints yet, we need them after validate ─────
        if (intent === 'CREATE_DREAM_DRAFT') {
            // Execute draft creation, then trigger validate, then checkpoint collection
            return orchestrator._dreamCreationFlow(parameters, userId, token, ctx);
        }

        // ── Confirmation gate for write operations ────────────────────────────────
        if (def.requiresConfirmation) {
            const summary = orchestrator._buildConfirmationSummary(intent, parameters, ctx);
            await redisDraftManager.saveDraft(userId, {
                intent,
                parameters,
                missingFields: [],
                status: 'AWAITING_CONFIRMATION',
                originalMessage: message,
                createdAt: Date.now(),
            });
            const resp = await responseGenerator.generate({
                responseMode: 'CONFIRMATION',
                confirmationSummary: summary,
                userMessage: message,
                ctx,
            });
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
            return resp;
        }

        // ── No confirmation needed — execute immediately ───────────────────────────
        return orchestrator._execute(intent, parameters, userId, token, ctx);
    },

    // ── Generate AI checkpoint suggestions for CREATE_TASK ────────────────────

    async _suggestCheckpoints(
        parameters: Record<string, any>,
        userId: string,
        ctx: any
    ): Promise<ChatResponse> {
        const today = new Date().toISOString().split('T')[0];
        const deadline = parameters.deadline.substring(0, 10);

        const prompt = `Generate daily checkpoints for a task.
Task: "${parameters.title}"
Start: ${today}
Deadline: ${deadline}

Rules:
- One checkpoint per day from today to deadline
- Each must be a concrete, actionable step
- Return ONLY a JSON array, nothing else
- Each item: { "title": string, "targetDate": "YYYY-MM-DD", "orderIndex": number }
- orderIndex starts at 0`;

        let suggested: any[] = [];
        try {
            const response = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.5,
                max_tokens: 500,
            });
            const raw = response.choices[0]?.message?.content || '[]';
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                // Validate every checkpoint via zod
                const validResult = TaskCheckpointArraySchema.safeParse(parsed);
                if (validResult.success) {
                    suggested = validResult.data;
                } else {
                    throw new Error('Checkpoint schema validation failed');
                }
            }
        } catch (error: any) {
            await logger.error('ai-orchestrator', 'Checkpoint suggestion failed', { error: error.message });
            // Fallback: simple daily suggestions
            const start = new Date();
            const end = new Date(parameters.deadline);
            const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            for (let i = 0; i < Math.min(daysDiff, 7); i++) {
                const d = new Date(start);
                d.setDate(d.getDate() + i);
                suggested.push({
                    title: `Day ${i + 1} — work on "${parameters.title}"`,
                    targetDate: d.toISOString().split('T')[0],
                    orderIndex: i,
                });
            }
        }

        await redisDraftManager.saveDraft(userId, {
            intent: 'CREATE_TASK',
            parameters,
            missingFields: [],
            suggestedCheckpoints: suggested,
            status: 'AWAITING_CHECKPOINT_CONFIRM',
            originalMessage: '',
            createdAt: Date.now(),
        });

        const resp = await responseGenerator.generate({
            responseMode: 'CHECKPOINT_REVIEW',
            checkpointList: suggested,
            userMessage: '',
            ctx,
        });
        await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
        return resp;
    },

    // ── Handle user edits to the checkpoint list ──────────────────────────────

    async _handleCheckpointEdit(
        draft: ChatDraft,
        message: string,
        userId: string,
        token: string,
        ctx: any
    ): Promise<ChatResponse> {
        const ok = ['looks good', 'confirmed', 'good', 'yes', 'ok', 'okay', 'proceed', 'submit', 'create'];
        if (ok.some((w) => message.toLowerCase().includes(w))) {
            // User confirmed — move to confirmation gate
            const params = { ...draft.parameters, checkpoints: draft.suggestedCheckpoints };
            const summary = orchestrator._buildConfirmationSummary('CREATE_TASK', params, ctx);
            await redisDraftManager.updateDraft(userId, { parameters: params, status: 'AWAITING_CONFIRMATION' });
            const resp = await responseGenerator.generate({
                responseMode: 'CONFIRMATION',
                confirmationSummary: summary,
                userMessage: message,
                ctx,
            });
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
            return resp;
        }

        // User wants to edit a checkpoint — ask LLM to apply the edit
        const editPrompt = `Current checkpoint list (JSON):
${JSON.stringify(draft.suggestedCheckpoints, null, 2)}

User edit request: "${message}"

Apply the user's edit and return the updated JSON array ONLY.
Rules: keep same structure { title, targetDate (YYYY-MM-DD), orderIndex }
Re-index orderIndex from 0 if items were removed.`;

        let updated = draft.suggestedCheckpoints || [];
        try {
            const response = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages: [{ role: 'user', content: editPrompt }],
                temperature: 0.2,
                max_tokens: 500,
            });
            const raw = response.choices[0]?.message?.content || '[]';
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const validResult = TaskCheckpointArraySchema.safeParse(parsed);
                if (validResult.success) updated = validResult.data;
            }
        } catch { /* keep existing */ }

        await redisDraftManager.updateDraft(userId, { suggestedCheckpoints: updated });
        const resp = await responseGenerator.generate({
            responseMode: 'CHECKPOINT_REVIEW',
            checkpointList: updated,
            userMessage: message,
            ctx,
        });
        await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
        return resp;
    },

    // ── Dream creation 3-step flow ────────────────────────────────────────────

    async _dreamCreationFlow(
        parameters: Record<string, any>,
        userId: string,
        token: string,
        ctx: any
    ): Promise<ChatResponse> {
        // Step 1: Create draft
        let dream: any;
        try {
            dream = await dreamApi.createDraft(token, {
                title: parameters.title,
                description: parameters.description,
                deadline: parameters.deadline,
                impactScore: parameters.impactScore,
                motivationStatement: parameters.motivationStatement,
            });
        } catch (error: any) {
            const apiError = orchestrator._extractApiError(error);
            await redisDraftManager.deleteDraft(userId);
            return responseGenerator.generate({ responseMode: 'ERROR', apiError, userMessage: '', ctx });
        }

        // Step 2: Validate (LLM generates dream checkpoints)
        let validation: any;
        try {
            validation = await dreamApi.validateDream(token, dream.id);
        } catch (error: any) {
            const apiError = orchestrator._extractApiError(error);
            return responseGenerator.generate({ responseMode: 'ERROR', apiError, userMessage: '', ctx });
        }

        // Validate the checkpoint suggestions from the dream validator
        const rawCheckpoints = validation?.validation?.suggestedCheckpoints || [];
        const validResult = DreamCheckpointArraySchema.safeParse(
            rawCheckpoints.map((cp: any, i: number) => ({
                title: cp.title || `Checkpoint ${i + 1}`,
                orderIndex: i,
                description: cp.description,
                expectedEffort: cp.expectedEffort,
                miniDeadline: cp.miniDeadline,
            }))
        );
        const checkpoints = validResult.success ? validResult.data : [];

        // Step 3: Present checkpoints to user for confirmation, then CONFIRM_DREAM
        await redisDraftManager.saveDraft(userId, {
            intent: 'CONFIRM_DREAM',
            parameters: { dreamId: dream.id },
            missingFields: [],
            suggestedCheckpoints: checkpoints,
            status: 'AWAITING_CHECKPOINT_CONFIRM',
            originalMessage: '',
            createdAt: Date.now(),
        });

        const resp = await responseGenerator.generate({
            responseMode: 'CHECKPOINT_REVIEW',
            checkpointList: checkpoints,
            userMessage: '',
            ctx,
        });
        await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
        return resp;
    },

    // ── Handle QUERY intents ──────────────────────────────────────────────────

    async _handleQuery(
        intent: IntentName,
        message: string,
        userId: string,
        token: string,
        ctx: any
    ): Promise<ChatResponse> {
        let apiResult: any;
        try {
            switch (intent) {
                case 'GET_DASHBOARD': apiResult = await analyticsApi.getDashboard(token); break;
                case 'LIST_SPRINTS': apiResult = await analyticsApi.listSprints(token); break;
                case 'LIST_TASKS': apiResult = await taskApi.listTasks(token); break;
                case 'LIST_DREAMS': apiResult = await dreamApi.listDreams(token); break;
                case 'LIST_NOTIFICATIONS': apiResult = await notificationApi.listNotifications(token); break;
                case 'GET_PREFERENCES': apiResult = await userApi.getPreferences(token); break;
                default:
                    // For intents needing IDs (GET_TASK, GET_DREAM, GET_SPRINT),
                    // extract params first then call
                    const { parameters } = await parameterExtractor.extract(intent, message, ctx, {});
                    apiResult = await orchestrator._callAdapterForIntent(intent, parameters, token);
            }
        } catch (error: any) {
            const apiError = orchestrator._extractApiError(error);
            return responseGenerator.generate({ responseMode: 'ERROR', apiError, userMessage: message, ctx });
        }

        const resp = await responseGenerator.generate({
            responseMode: 'SUCCESS',
            intent,
            apiResult,
            userMessage: message,
            ctx,
        });
        await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
        return resp;
    },

    // ── Execute confirmed action ──────────────────────────────────────────────

    async _execute(
        intent: IntentName,
        parameters: Record<string, any>,
        userId: string,
        token: string,
        ctx: any
    ): Promise<ChatResponse> {
        await redisDraftManager.updateDraft(userId, { status: 'EXECUTING' });

        let apiResult: any;
        try {
            apiResult = await orchestrator._callAdapterForIntent(intent, parameters, token);
        } catch (error: any) {
            // ⚠️ API error — keep draft alive (revert status to AWAITING_CONFIRMATION)
            const apiError = orchestrator._extractApiError(error);
            await redisDraftManager.updateDraft(userId, { status: 'AWAITING_CONFIRMATION' });
            const errResp = await responseGenerator.generate({
                responseMode: 'ERROR',
                apiError,
                userMessage: '',
                ctx,
            });
            await contextBuilder.appendHistory(userId, { role: 'assistant', content: errResp.text });
            return errResp;
        }

        // ── Success — clear draft and invalidate context cache ────────────────────
        await redisDraftManager.deleteDraft(userId);
        await contextBuilder.invalidateContextCache(userId);

        const resp = await responseGenerator.generate({
            responseMode: 'SUCCESS',
            intent,
            apiResult,
            userMessage: '',
            ctx,
        });
        await contextBuilder.appendHistory(userId, { role: 'assistant', content: resp.text });
        return resp;
    },

    // ── Route intent to the correct API adapter method ────────────────────────

    async _callAdapterForIntent(
        intent: IntentName,
        params: Record<string, any>,
        token: string
    ): Promise<any> {
        switch (intent) {
            // Task
            case 'CREATE_TASK':
                return taskApi.createTask(token, {
                    title: params.title, deadline: params.deadline, dreamId: params.dreamId,
                    priority: params.priority, description: params.description,
                    startDate: params.startDate, estimatedDuration: params.estimatedDuration,
                    checkpoints: params.checkpoints,
                });
            case 'UPDATE_TASK':
                return taskApi.updateTask(token, params.taskId, params);
            case 'COMPLETE_TASK':
                return taskApi.completeTask(token, params.taskId);
            case 'BLOCK_TASK':
                return taskApi.blockTask(token, params.taskId);
            case 'ARCHIVE_TASK':
                return taskApi.archiveTask(token, params.taskId);
            case 'UPDATE_TASK_PROGRESS':
                return taskApi.updateTaskProgress(token, params.taskId, params.value);
            case 'GET_TASK':
                return taskApi.getTask(token, params.taskId);
            case 'LIST_TASKS':
                return taskApi.listTasks(token, params.dreamId, params.status);

            // Checkpoint
            case 'UPDATE_CHECKPOINT':
                return taskApi.updateCheckpoint(token, params.taskId, params.checkpointId, {
                    title: params.title, targetDate: params.targetDate,
                });
            case 'UPDATE_CHECKPOINT_PROGRESS':
                return taskApi.updateCheckpointProgress(
                    token, params.taskId, params.checkpointId, params.delta, params.localDate
                );
            case 'DELETE_CHECKPOINT':
                return taskApi.deleteCheckpoint(token, params.taskId, params.checkpointId);

            // Dream
            case 'CREATE_DREAM_DRAFT':
                return dreamApi.createDraft(token, params as any);
            case 'VALIDATE_DREAM':
                return dreamApi.validateDream(token, params.dreamId);
            case 'CONFIRM_DREAM':
                return dreamApi.confirmDream(token, params.dreamId, params.checkpoints);
            case 'UPDATE_DREAM':
                return dreamApi.updateDream(token, params.dreamId, params);
            case 'ARCHIVE_DREAM':
                return dreamApi.archiveDream(token, params.dreamId);
            case 'COMPLETE_DREAM':
                return dreamApi.completeDream(token, params.dreamId);
            case 'FAIL_DREAM':
                return dreamApi.failDream(token, params.dreamId);
            case 'GET_DREAM':
                return dreamApi.getDream(token, params.dreamId);
            case 'LIST_DREAMS':
                return dreamApi.listDreams(token, params.status);

            // Analytics
            case 'GET_DASHBOARD': return analyticsApi.getDashboard(token);
            case 'LIST_SPRINTS': return analyticsApi.listSprints(token);
            case 'GET_SPRINT': return analyticsApi.getSprint(token, params.weekStart);

            // User
            case 'GET_PREFERENCES': return userApi.getPreferences(token);
            case 'UPDATE_PREFERENCES': return userApi.updatePreferences(token, params as any);
            case 'UPDATE_PROFILE': return userApi.updateProfile(token, { timezone: params.timezone });

            // Notifications
            case 'LIST_NOTIFICATIONS': return notificationApi.listNotifications(token);
            case 'PUSH_SUBSCRIBE':
                return notificationApi.subscribe(token, {
                    endpoint: params.endpoint, p256dh: params.p256dh, auth: params.auth,
                });
            case 'PUSH_UNSUBSCRIBE':
                return notificationApi.unsubscribe(token, { endpoint: params.endpoint });

            default:
                throw new Error(`No adapter found for intent: ${intent}`);
        }
    },

    // ── Build human-readable confirmation summary ─────────────────────────────

    _buildConfirmationSummary(intent: IntentName, params: Record<string, any>, ctx: any): string {
        const dreamTitle = ctx.activeDreams?.find((d: any) => d.id === params.dreamId)?.title;

        const lines: string[] = [`**Action:** ${intent.replace(/_/g, ' ')}`];
        if (params.title) lines.push(`**Title:** ${params.title}`);
        if (params.description) lines.push(`**Description:** ${params.description}`);
        if (params.deadline) lines.push(`**Deadline:** ${params.deadline.substring(0, 10)}`);
        if (params.dreamId) lines.push(`**Dream:** ${dreamTitle || params.dreamId}`);
        if (params.priority) lines.push(`**Priority:** ${params.priority}/5`);
        if (params.checkpoints) lines.push(`**Checkpoints:** ${params.checkpoints.length} planned`);
        if (params.impactScore) lines.push(`**Impact Score:** ${params.impactScore}/10`);
        if (params.taskId) lines.push(`**Task ID:** ${params.taskId}`);
        if (params.checkpointId) lines.push(`**Checkpoint ID:** ${params.checkpointId}`);
        if (params.value !== undefined) lines.push(`**Progress value:** ${params.value}`);
        if (params.delta !== undefined) lines.push(`**Progress delta:** +${params.delta}`);
        if (params.timezone) lines.push(`**Timezone:** ${params.timezone}`);

        return lines.join('\n');
    },

    // ── Extract API error message from axios error ────────────────────────────

    _extractApiError(error: any): string {
        if (axios.isAxiosError(error)) {
            return error.response?.data?.error || error.message;
        }
        return error.message || 'Unknown error';
    },
};
