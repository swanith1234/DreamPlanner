import axios from 'axios';
import { Feedback } from '@prisma/client';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

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

  const typeLabel = feedback.type === 'BUG' ? '🚨 *New Bug Report*' : '💡 *New Idea/Feedback*';
  const actionLabel = feedback.type === 'BUG' ? '✅ Accept & Fix' : '✅ Accept';

  // Telegram Markdown limits to ~4096 chars, so we truncate the combined message to 3000
  const text = `${typeLabel}\n\n*Feedback ID:* \`${feedback.id}\`\n*Trace ID:* \`${feedback.traceId || 'N/A'}\`\n\n*Details:*\n\`\`\`text\n${combinedMessage.substring(0, 3000)}\n\`\`\``;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: actionLabel, callback_data: `fix_${feedback.id}` },
        { text: '🗑️ Ignore', callback_data: `ignore_${feedback.id}` }
      ]
    ]
  };

  try {
    const response = await axios.post(`${API_BASE}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    });
    console.log(`[Telegram] sendMessage success:`, response.data?.ok ? 'OK' : 'FAIL');
  } catch (err: any) {
    console.error(`[Telegram] sendMessage ERROR:`, err?.response?.data || err?.message);
  }
}
