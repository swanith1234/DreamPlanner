// src/modules/admin/admin.controller.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import axios from 'axios';
import { Feedback } from '@prisma/client';
import { globalCache, MemoryCache } from '../../utils/cache';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Sanitizes error messages to prevent raw HTML from flooding the logs.
 * If the message looks like HTML, it extracts the title or just returns a snippet.
 */
function sanitizeErrorMessage(data: any): string {
  if (typeof data !== 'string') return JSON.stringify(data);
  
  // If it's HTML
  if (data.includes('<!DOCTYPE') || data.includes('<html')) {
    const titleMatch = data.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) return `HTML Error: ${titleMatch[1]}`;
    return `HTML Error: (Page too large to display, starts with: ${data.slice(0, 100)}...)`;
  }
  
  return data;
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

async function triggerCodeMind(feedback: Feedback) {
  const CODE_MIND_WEBHOOK_URL = process.env.CODE_MIND_WEBHOOK_URL || 'https://codemind-5pz9.onrender.com/webhook/crash';
  const BACKEND_URL = process.env.API_URL || 'http://localhost:3000';

  console.log(`[Admin Controller] Triggering Code-Mind for feedback ${feedback.id}.`);

  try {
    // 1. Create initial log
    await prisma.appLog.create({
      data: {
        level: 'INFO',
        source: 'codeMindPipeline',
        message: 'Pipeline initialized. Dispatched request to Code-Mind agent...',
        context: { feedbackId: feedback.id }
      }
    });

    let combinedMessage = `[HUMAN FEEDBACK]\n${feedback.message}`;
    let functionName = '<unknown>';
    let filePath = undefined;
    let curlCommand = undefined;

    if (feedback.traceId) {
      try {
        const appLog = await prisma.appLog.findFirst({
          where: { 
            source: 'globalErrorHandler',
            context: {
              path: ['traceId'],
              equals: feedback.traceId
            }
          }
        });

        if (appLog && appLog.context) {
          const ctx = appLog.context as any;
          combinedMessage += `\n\n[TECHNICAL ERROR]\n${ctx.stackTrace || appLog.message}`;
          functionName = ctx.functionName || functionName;
          filePath = ctx.filePath;
          curlCommand = ctx.curlCommand;
        }
      } catch (err) {
        console.warn(`[Admin Controller] Failed to lookup technical context:`, err);
      }
    }

    await axios.post(
      CODE_MIND_WEBHOOK_URL,
      {
        traceId: feedback.traceId || `manual-${feedback.id.slice(0,8)}`,
        feedbackId: feedback.id,
        functionName,
        filePath,
        errorMessage: combinedMessage,
        curlCommand,
        callbackUrl: `${BACKEND_URL}/api/admin/pipeline/update`
      },
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log(`[Admin Controller] Successfully reached Code-Mind for feedback ${feedback.id}`);
  } catch (err: any) {
    const errorData = err?.response?.data || err?.message;
    const sanitizedMsg = sanitizeErrorMessage(errorData);
    console.error('[Admin Controller] Failed to trigger Code-Mind:', sanitizedMsg);
    
    await prisma.appLog.create({
      data: {
        level: 'ERROR',
        source: 'codeMindPipeline',
        message: `Failed to reach Code-Mind agent: ${sanitizedMsg}`,
        context: { feedbackId: feedback.id }
      }
    });
  }
}

async function replyToTelegramCallback(chatId: string, messageId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] }
    });
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('[Admin Controller] Failed to reply to Telegram:', err);
  }
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

export const getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const range = (req.query.range as string) || 'month';
    const userId = (req as any).userId || 'admin';

    const cacheKey = MemoryCache.generateKey('admin_dashboard', userId, { range });
    const cachedData = globalCache.get(cacheKey);
    if (cachedData) {
      res.status(200).json(cachedData);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [
      totalUsers,
      registeredToday,
      registeredWeek,
      registeredMonth,
      registeredYear,
      activeTodayTasks,
      activeTodayDays
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfYear } } }),
      prisma.task.groupBy({
        by: ['userId'],
        where: { updatedAt: { gte: today } },
      }),
      prisma.day.groupBy({
        by: ['userId'],
        where: { date: { gte: today } },
      })
    ]);

    const activeToday = new Set([
      ...activeTodayTasks.map(t => t.userId),
      ...activeTodayDays.map(d => d.userId)
    ]).size;

    let fromDate = new Date(today);
    let groupByFormat = 'day';

    if (range === 'week') fromDate.setDate(fromDate.getDate() - 7);
    else if (range === 'month') fromDate.setMonth(fromDate.getMonth() - 1);
    else if (range === 'year') {
      fromDate.setFullYear(fromDate.getFullYear() - 1);
      groupByFormat = 'month';
    } else if (range === 'all') {
      const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
      fromDate = firstUser?.createdAt ? new Date(firstUser.createdAt) : startOfYear;
      fromDate.setDate(1);
      groupByFormat = 'month';
    }

    const registrationStats: { date_part: string; count: bigint }[] = await prisma.$queryRaw`
      SELECT 
        TO_CHAR("createdAt", ${groupByFormat === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}) as date_part,
        COUNT(*) as count
      FROM "User"
      WHERE "createdAt" >= ${fromDate}
      GROUP BY date_part
      ORDER BY date_part ASC
    `;

    const regMap = new Map(registrationStats.map(s => [s.date_part, Number(s.count)]));
    const registrationChart = [];
    const end = new Date();
    
    for (let d = new Date(fromDate); d <= end; ) {
      const key = d.toISOString().split('T')[0].slice(0, groupByFormat === 'day' ? 10 : 7);
      const display = d.toLocaleDateString('en-US', groupByFormat === 'day' ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' });
      registrationChart.push({ date: display, rawDate: key, users: regMap.get(key) || 0 });
      
      if (groupByFormat === 'day') d.setDate(d.getDate() + 1);
      else d.setMonth(d.getMonth() + 1);
    }

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [dailyActiveStats, resolvedFeedbacks, feedbacks] = await Promise.all([
      prisma.$queryRaw`
        SELECT date_part, COUNT(DISTINCT "userId") as active_count
        FROM (
          SELECT "userId", TO_CHAR("updatedAt", 'YYYY-MM-DD') as date_part FROM "Task" WHERE "updatedAt" >= ${thirtyDaysAgo}
          UNION ALL
          SELECT "userId", TO_CHAR("date", 'YYYY-MM-DD') as date_part FROM "Day" WHERE "date" >= ${thirtyDaysAgo}
        ) as combined
        GROUP BY date_part
        ORDER BY date_part ASC
      `,
      prisma.feedback.findMany({
        where: { status: 'RESOLVED', type: 'BUG' },
        orderBy: { resolvedAt: 'desc' },
        take: 10,
        select: { id: true, createdAt: true, resolvedAt: true }
      }),
      prisma.feedback.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50
      })
    ]);

    const activeMap = new Map((dailyActiveStats as any[]).map(s => [s.date_part, Number(s.active_count)]));
    const growthChart = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      growthChart.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        activeUsers: activeMap.get(key) || 0
      });
    }

    const performanceChart = resolvedFeedbacks.reverse().map(f => ({
      id: f.id.slice(0, 8),
      hours: Math.round(((f.resolvedAt!.getTime() - f.createdAt.getTime()) / (1000 * 60 * 60)) * 10) / 10
    }));

    const responseData = {
      activeToday,
      growthChart,
      performanceChart,
      feedbacks,
      totalUsers,
      registeredToday,
      registeredWeek,
      registeredMonth,
      registeredYear,
      registrationChart
    };

    globalCache.set(cacheKey, responseData);
    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

const invalidateAdminCache = (userId: string) => {
  globalCache.deleteByPrefix(MemoryCache.generateKey('admin_dashboard', userId));
};

// ─── MANUAL UI FALLBACK ──────────────────────────────────────────────────────

export const handleFeedbackAction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
     const { id } = req.params;
     const { action } = req.body;
     
     const feedback = await prisma.feedback.findUnique({ where: { id } });
     if (!feedback) {
       res.status(404).json({ error: 'Feedback not found' });
       return;
     }

     if (action === 'ignore') {
       await prisma.feedback.update({ where: { id }, data: { status: 'IGNORED' } });
       invalidateAdminCache((req as any).userId || 'admin');
       res.json({ success: true, message: 'Ignored' });
       return;
     }

     if (action === 'fix') {
       await prisma.feedback.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
       invalidateAdminCache((req as any).userId || 'admin');
       
       triggerCodeMind(feedback);
       res.json({ success: true, message: 'Triggered Code-Mind' });
       return;
     }

     res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
     next(err);
  }
};

// ─── TELEGRAM WEBHOOK ────────────────────────────────────────────────────────

export const handleTelegramWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
     res.status(200).send('OK');

     const update = req.body;
     if (update.callback_query) {
       const data = update.callback_query.data;
       const chatId = update.callback_query.message.chat.id;
       const messageId = update.callback_query.message.message_id;

        if (data.startsWith('fix_')) {
          const id = data.replace('fix_', '');
          const feedback = await prisma.feedback.findUnique({ where: { id } });
          if (feedback) {
             await prisma.feedback.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
             triggerCodeMind(feedback);
             
             const adminUrl = process.env.ADMIN_URL || 'http://localhost:5173';
             const fixUrl = `${adminUrl}/app/fix/${id}`;

             await replyToTelegramCallback(
               chatId, 
               messageId, 
               `✅ Accepted! Pipeline triggered.\n\n📺 <b>Watch Live Fix:</b> ${fixUrl}`
             );
          }
       } else if (data.startsWith('ignore_')) {
          const id = data.replace('ignore_', '');
          await prisma.feedback.update({ where: { id }, data: { status: 'IGNORED' } });
          await replyToTelegramCallback(chatId, messageId, `🗑️ Task \`${id.slice(0, 8)}\` ignored.`);
       }
     }
  } catch (err) {
     console.error('[Admin Controller] Telegram Webhook Error:', err);
  }
};

// ─── PIPELINE UPDATES ────────────────────────────────────────────────────────

export const postPipelineUpdate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { feedbackId, message, level = 'INFO' } = req.body;

    if (!feedbackId || !message) {
      res.status(400).json({ error: 'feedbackId and message are required' });
      return;
    }

    // Sanitize incoming messages too, in case the agent sends something weird
    const sanitizedMsg = sanitizeErrorMessage(message);

    await prisma.appLog.create({
      data: {
        level,
        source: 'codeMindPipeline',
        message: sanitizedMsg,
        context: { feedbackId }
      }
    });

    // Invalidate pipeline logs cache for all admins
    globalCache.deleteByPrefix(MemoryCache.generateKey('pipeline_logs', 'admin_shared'));

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const getPipelineLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { feedbackId } = req.params;

    const cacheKey = MemoryCache.generateKey('pipeline_logs', 'admin_shared', { feedbackId });
    const cachedData = globalCache.get(cacheKey);
    if (cachedData) {
      res.status(200).json(cachedData);
      return;
    }

    const logs = await prisma.appLog.findMany({
      where: {
        source: 'codeMindPipeline',
        context: {
          path: ['feedbackId'],
          equals: feedbackId
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const response = { logs };
    globalCache.set(cacheKey, response, 5);
    res.json(response);
  } catch (err) {
    next(err);
  }
};
