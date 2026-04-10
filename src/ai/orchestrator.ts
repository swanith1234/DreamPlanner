// src/ai/orchestrator.ts
// ─────────────────────────────────────────────────────────────────────────────
// Native OpenAI-compatible orchestrator for DreamPlanner.
// Supports Groq, OpenRouter, DeepSeek, Cerebras, and Sambanova via a Priority Fallback Queue.
// ─────────────────────────────────────────────────────────────────────────────

import { groq, GROQ_MODEL } from '../config/ai';
import { logger } from '../utils/logger';
import { chatService } from '../modules/chat/chat.service';
import { TASK_TOOLS, DREAM_TOOLS, ANALYTICS_TOOLS, USER_TOOLS, ROADMAP_TOOLS } from './tools';
import { executeTool } from './toolExecutor';
import { buildUserContext, invalidateContextCache } from './contextBuilder';
import { buildSystemPrompt } from './systemPrompt';
import { notificationWS } from '../modules/notification/websocket.server';
import { pushService } from '../modules/notification/push.service';

import { executeWithFallback, type ChatMessage } from './llmClient';

// Response returned to the controller
export interface ChatResponse {
    text: string;
    responseMode: 'CHAT' | 'SUCCESS' | 'ERROR';
}

/** 
 * Step 1: Zero-Tool Intent Check (Lightweight Pass)
 * Categorizes the request into a bucket so we only send relevant tools.
 */
async function detectIntent(message: string, history: any[]): Promise<{ intent: 'TASKS' | 'DREAMS' | 'ROADMAP' | 'ANALYTICS' | 'USER' | 'CHAT', complexity: 'SIMPLE' | 'COMPLEX' }> {
    const context = history.slice(-3).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    
    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: `Analyze user request. Return JSON: {"intent": "TASKS"|"DREAMS"|"ROADMAP"|"ANALYTICS"|"USER"|"CHAT", "complexity": "SIMPLE"|"COMPLEX"}.
                    
CONTEXT:
${context}

REQUEST: ${message}`
                },
                { role: 'user', content: message }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 50,
            temperature: 0,
        }) as any;

        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
        return {
            intent: (parsed.intent || 'CHAT').toUpperCase() as any,
            complexity: parsed.complexity === 'COMPLEX' ? 'COMPLEX' : 'SIMPLE'
        };
    } catch {
        return { intent: 'TASKS', complexity: 'SIMPLE' }; //what is this when any error occur in detecting the intent..it is simply scheduling to the tasks tool
    }
}


// ── Main Orchestrator ────────────────────────────────────────────────────────

export const orchestrator = {
    async process(input: { userId: string, message: string, token: string }): Promise<ChatResponse> {
        const { userId, message, token } = input;

        // 1. Save user msg (marked as seen immediately since it's from the user)
        await chatService.saveMessage(userId, 'user', message, null, null, null, new Date());

        // 2. Load context
        let history = await chatService.getConversationWindow(userId, 5);
        let name = 'there', motivationTone = 'NEUTRAL', contextBlock = '', agentName = 'IgniteMate';
    
        try {
            const ctx = await buildUserContext(token, userId);
            name = ctx.name;
            agentName = ctx.agentName || 'IgniteMate';
            motivationTone = ctx.motivationTone;
            contextBlock = ctx.contextBlock;
        } catch (err: any) {
            await logger.warn('orchestrator', 'Context build failed', { err: err.message });
        }

        // 3. System Prompt & Intent
        const systemMsg: ChatMessage = { role: 'system', content: buildSystemPrompt(contextBlock, motivationTone, name) };
        const { intent, complexity } = await detectIntent(message, history);
        
        const toolMap: Record<string, any[]> = { TASKS: TASK_TOOLS, DREAMS: DREAM_TOOLS, ROADMAP: ROADMAP_TOOLS, ANALYTICS: ANALYTICS_TOOLS, USER: USER_TOOLS };
        const toolSubset = toolMap[intent];

        await logger.info('orchestrator', `[INTENT] intent=${intent} complexity=${complexity} tools=${toolSubset?.length || 0}`, {});

        // 4. Agentic Loop
        const messages: ChatMessage[] = [systemMsg, ...history as any[]];
        const MAX_ITERATIONS = 5;

        // Debug: Log payload sizes
        const sysChars = JSON.stringify(systemMsg).length;
        const histChars = JSON.stringify(history).length;
        const toolsChars = JSON.stringify(toolSubset || []).length;
        await logger.info('orchestrator', `[SIZE] system=${sysChars} history=${histChars} tools=${toolsChars} total=${sysChars + histChars + toolsChars}`, {});

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
            let response: any;
            try {
                response = await executeWithFallback(messages, { complexity, tools: toolSubset, max_tokens: 1500 }, iteration);
            } catch (error: any) {
                await logger.error('orchestrator', 'Fallback Exhausted', { error: error.message });
                const errText = 'I am having trouble reaching my brain components. Please try again.';
                await chatService.saveMessage(userId, 'assistant', errText);
                return { text: errText, responseMode: 'ERROR' };
            }

            const aiMessage = response.choices[0]?.message;
            if (!aiMessage) break;

            // ── Text response: done ─────────────────────────────────────────
            if (!aiMessage.tool_calls?.length) {
                const text = aiMessage.content?.trim() || "I'm not sure how to respond to that.";
                await logger.info('orchestrator', `[FINAL] iter=${iteration} chars=${text.length}`, {});
                
                // Save assistant message
                await chatService.saveMessage(userId, 'assistant', text);

                // WhatsApp Fallback: If no active socket, send push
                if (!notificationWS.hasActiveClients(userId)) {
                    await pushService.sendPushNotification(userId, {
                        title: agentName,
                        body: text,
                        data: { url: '/app/home' }
                    }).catch(err => logger.warn('orchestrator', 'Push fallback failed', { err: err.message }));
                }

                return { text, responseMode: 'CHAT' };
            }

            // ── Tool calls: execute ──────────────────────────────────────────
            // IMPORTANT: Save assistant message with tool_calls FIRST to satisfy DB constraints
            await chatService.saveMessage(userId, 'assistant', aiMessage.content, aiMessage.tool_calls);
            messages.push({
                role: 'assistant',
                content: aiMessage.content,
                tool_calls: aiMessage.tool_calls
            });

            for (const call of aiMessage.tool_calls) {
                const toolName = call.function.name;
                const toolArgsString = call.function.arguments || '{}';
                let toolArgs: any;
                try {
                    toolArgs = JSON.parse(toolArgsString);
                } catch {
                    toolArgs = {};
                }
                
                const result = await executeTool(toolName, toolArgs, token);
                const resultContent = JSON.stringify(result);

                // Save tool result
                await chatService.saveMessage(userId, 'tool', resultContent, null, call.id);
                messages.push({ role: 'tool', tool_call_id: call.id, content: resultContent });

                // Invalidate cache on writes
                const WRITE_TOOLS = ['createTask', 'updateTask', 'completeTask', 'blockTask', 'archiveTask',
                    'updateTaskProgress', 'updateCheckpoint', 'updateCheckpointProgress', 'deleteCheckpoint',
                    'createDream', 'updateDream', 'confirmDream', 'completeDream', 'failDream', 'archiveDream',
                    'syncDreamState', 'updatePreferences', 'updateProfile'];
                if (WRITE_TOOLS.includes(toolName) && !result?.error) {
                    await invalidateContextCache(userId);
                }
            }
        }

        const timeoutMsg = "I worked on your request but timed out before I could finish. Please check your tasks.";
        await chatService.saveMessage(userId, 'assistant', timeoutMsg);
        return { text: timeoutMsg, responseMode: 'ERROR' };
    },
};
