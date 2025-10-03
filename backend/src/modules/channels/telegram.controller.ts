import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { AiService } from '../ai/ai.service';

type TelegramMessage = {
  message?: { message_id: number; chat: { id: number }; from?: { id: number; username?: string }; text?: string };
  edited_message?: { message_id: number; chat: { id: number }; from?: { id: number; username?: string }; text?: string };
};

@Controller('channels/telegram')
export class TelegramController {
  constructor(private readonly chat: ChatService, private readonly ai: AiService) {}

  @Post('webhook')
  async webhook(@Body() update: TelegramMessage) {
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) return { ok: true };
    const channelUserId = String(msg.from?.id ?? msg.chat.id);
    const session = await this.chat.getOrCreateSessionForChannel('telegram', channelUserId);
    await this.chat.postMessage({ sessionId: session.id, sender: 'user', text: msg.text });
    const aiReply = await this.ai.generateReply(msg.text);
    await this.chat.postMessage({ sessionId: session.id, sender: 'ai', text: aiReply });

    // Send reply back to Telegram chat if bot token is configured
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: msg.chat.id, text: aiReply }),
      }).catch(() => void 0);
    }

    return { ok: true };
  }
}


