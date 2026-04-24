import axios from 'axios';
import { Feedback } from '@prisma/client';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

function escapeHTML(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sends a bug report approval request to the Admin Telegram chat.
 * Includes inline keyboard buttons to Accept/Fix or Ignore.
 */
export async function sendApprovalRequest(feedback: Feedback, combinedMessage: string) {
  console.log(`[Telegram] Preparing approval request for feedback ${feedback.id}`);
  
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('[Telegram] ERROR: Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.');
    return;
  }

  const typeLabel = feedback.type === 'BUG' ? '🚨 <b>New Bug Report</b>' : '💡 <b>New Idea/Feedback</b>';
  const actionLabel = feedback.type === 'BUG' ? '✅ Accept & Fix' : '✅ Accept';

  // Telegram limits to ~4096 chars
  const escapedMessage = escapeHTML(combinedMessage.substring(0, 3500));
  const text = `${typeLabel}\n\n<b>Feedback ID:</b> <code>${feedback.id}</code>\n<b>Trace ID:</b> <code>${feedback.traceId || 'N/A'}</code>\n\n<b>Details:</b>\n<pre>${escapedMessage}</pre>`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: actionLabel, callback_data: `fix_${feedback.id}` },
        { text: '🗑️ Ignore', callback_data: `ignore_${feedback.id}` }
      ]
    ]
  };

  try {
    const url = `${API_BASE}/sendMessage`;
    console.log(`[Telegram] Sending to: ${url} for chat: ${TELEGRAM_CHAT_ID}`);
    
    const response = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML',
      reply_markup: inlineKeyboard
    });
    
    console.log(`[Telegram] sendMessage success:`, response.data?.ok ? 'OK' : 'FAIL');
  } catch (err: any) {
    console.error(`[Telegram] sendMessage ERROR status:`, err?.response?.status);
    console.error(`[Telegram] sendMessage ERROR data:`, JSON.stringify(err?.response?.data || {}));
    console.error(`[Telegram] sendMessage ERROR message:`, err?.message);
  }
}
