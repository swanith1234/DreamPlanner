import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import axios from 'axios';
import { Feedback } from '@prisma/client';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ─── UTILITIES ───────────────────────────────────────────────────────────────

async function triggerCodeMind(feedback: Feedback) {
  const CODE_MIND_WEBHOOK_URL = process.env.CODE_MIND_WEBHOOK_URL || 'https://codemind-5pz9.onrender.com/webhook/crash';
  const BACKEND_URL = process.env.API_URL || 'http://localhost:3000';

  console.log(`[Admin Controller] Triggering Code-Mind for feedback ${feedback.id}. TraceId: ${feedback.traceId}`);

  try {
    let combinedMessage = `[HUMAN FEEDBACK]\n${feedback.message}`;
    let functionName = '<unknown>';
    let filePath = undefined;
    let curlCommand = undefined;

    if (feedback.traceId) {
      // Try to find technical context, but don't fail if missing
      const appLog = await prisma.appLog.findFirst({
        where: { 
          source: 'globalErrorHandler',
          // Use string contains if path filter is being finicky
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
      } else {
        console.warn(`[Admin Controller] No technical AppLog found for traceId: ${feedback.traceId}. Proceeding with human feedback only.`);
      }
    }

    // Always create initial log so user sees SOMETHING in the dashboard
    await prisma.appLog.create({
      data: {
        level: 'INFO',
        source: 'codeMindPipeline',
        message: 'Pipeline initialized. Dispatched request to Code-Mind agent...',
        userId: feedback.id,
      }
    });

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
      { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
    );
    
    console.log(`[Admin Controller] Successfully reached Code-Mind for feedback ${feedback.id}`);
  } catch (err: any) {
    const errorMsg = err?.response?.data || err?.message;
    console.error('[Admin Controller] Failed to trigger Code-Mind:', errorMsg);
    
    await prisma.appLog.create({
      data: {
        level: 'ERROR',
        source: 'codeMindPipeline',
        message: `Failed to reach Code-Mind agent: ${err.message}`,
        userId: feedback.id,
      }
    });
  }
}

async function replyToTelegramCallback(chatId: string, messageId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    // Remove the buttons
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] }
    });
    // Send confirmation
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
    const range = req.query.range as string || 'month'; // 'week', 'month', 'year', 'all'
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [totalUsers, registeredToday, registeredWeek, registeredMonth, registeredYear] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.user.count({ where: { createdAt: { gte: startOfYear } } })
    ]);

    // Registration Chart Logic
    let fromDate = new Date(today);
    let groupBy = 'day';

    if (range === 'week') {
        fromDate.setDate(fromDate.getDate() - 7);
    } else if (range === 'month') {
        fromDate.setMonth(fromDate.getMonth() - 1);
    } else if (range === 'year') {
        fromDate.setFullYear(fromDate.getFullYear() - 1);
        groupBy = 'month';
    } else if (range === 'all') {
        const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }});
        fromDate = firstUser ? new Date(firstUser.createdAt) : new Date(today.getFullYear(), 0, 1);
        fromDate.setDate(1); // align to month start
        groupBy = 'month';
    }

    const recentUsers = await prisma.user.findMany({
        where: { createdAt: { gte: fromDate } },
        select: { createdAt: true }
    });

    const regMap = new Map<string, number>();
    recentUsers.forEach(u => {
        const d = u.createdAt;
        const key = groupBy === 'day' 
            ? d.toISOString().split('T')[0] 
            : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        regMap.set(key, (regMap.get(key) || 0) + 1);
    });

    const registrationChart = [];
    const end = new Date();
    if (groupBy === 'day') {
        for (let d = new Date(fromDate); d <= end; d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().split('T')[0];
            const display = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            registrationChart.push({ date: display, rawDate: key, users: regMap.get(key) || 0 });
        }
    } else {
        for (let d = new Date(fromDate); d <= end; d.setMonth(d.getMonth() + 1)) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const display = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            registrationChart.push({ date: display, rawDate: key, users: regMap.get(key) || 0 });
        }
    }

    // 1. KPI: Active Today (Distinct users updating a task or a day)
    const activeTasks = await prisma.task.findMany({
      where: { updatedAt: { gte: today } },
      select: { userId: true },
      distinct: ['userId']
    });
    const activeDays = await prisma.day.findMany({
      where: { date: { gte: today } },
      select: { userId: true },
      distinct: ['userId']
    });
    
    const activeUserIds = new Set([
      ...activeTasks.map(t => t.userId),
      ...activeDays.map(d => d.userId)
    ]);
    const activeToday = activeUserIds.size;

    // 2. Growth Chart (Last 30 days active count) - Optimized to 2 queries
    const growthChart = [];
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allTasks = await prisma.task.findMany({
      where: { updatedAt: { gte: thirtyDaysAgo } },
      select: { userId: true, updatedAt: true }
    });
    const allDays = await prisma.day.findMany({
      where: { date: { gte: thirtyDaysAgo } },
      select: { userId: true, date: true }
    });

    const dailyActiveMap = new Map<string, Set<string>>();

    allTasks.forEach(t => {
      const dateKey = t.updatedAt.toISOString().split('T')[0];
      if (!dailyActiveMap.has(dateKey)) dailyActiveMap.set(dateKey, new Set());
      dailyActiveMap.get(dateKey)!.add(t.userId);
    });

    allDays.forEach(d => {
      const dateKey = d.date.toISOString().split('T')[0];
      if (!dailyActiveMap.has(dateKey)) dailyActiveMap.set(dateKey, new Set());
      dailyActiveMap.get(dateKey)!.add(d.userId);
    });

    for (let i = 29; i >= 0; i--) {
       const d = new Date(today);
       d.setDate(d.getDate() - i);
       const dateKey = d.toISOString().split('T')[0];
       
       growthChart.push({
         date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
         activeUsers: dailyActiveMap.get(dateKey)?.size || 0
       });
    }

    // 3. Performance Chart (Last 10 bugs, resolution time in hours)
    const resolvedFeedbacks = await prisma.feedback.findMany({
      where: { status: 'RESOLVED', type: 'BUG' },
      orderBy: { resolvedAt: 'desc' },
      take: 10
    });
    
    const performanceChart = resolvedFeedbacks.reverse().map(f => {
      const ms = f.resolvedAt!.getTime() - f.createdAt.getTime();
      const hours = Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
      return {
        id: f.id.slice(0, 8),
        hours
      };
    });

    // 4. Feedback List
    const feedbacks = await prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' }
    });

    res.json({
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
    });
  } catch (error) {
    next(error);
  }
};

// ─── MANUAL UI FALLBACK ──────────────────────────────────────────────────────

export const handleFeedbackAction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
     const { id } = req.params;
     const { action } = req.body; // 'fix' or 'ignore'
     
     const feedback = await prisma.feedback.findUnique({ where: { id } });
     if (!feedback) {
       res.status(404).json({ error: 'Feedback not found' });
       return;
     }

     if (action === 'ignore') {
       await prisma.feedback.update({ where: { id }, data: { status: 'IGNORED' } });
       res.json({ success: true, message: 'Ignored' });
       return;
     }

     if (action === 'fix') {
       await prisma.feedback.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
       
       if (feedback.traceId) {
         triggerCodeMind(feedback);
       }
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
     // Acknowledge to Telegram immediately
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
             if (feedback.traceId) triggerCodeMind(feedback);
             
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

    await prisma.appLog.create({
      data: {
        level,
        source: 'codeMindPipeline',
        message: message,
        userId: feedbackId, // Reusing userId field for feedbackId mapping
      }
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const getPipelineLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { feedbackId } = req.params;

    const logs = await prisma.appLog.findMany({
      where: {
        source: 'codeMindPipeline',
        userId: feedbackId
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({ logs });
  } catch (err) {
    next(err);
  }
};
