import { Telegraf } from 'telegraf';

export class TelegramAlert {
  private bot: Telegraf;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    this.bot = new Telegraf(token);
  }

  async sendGroupAlert(groupId: string, message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(groupId, message);
    } catch (error) {
      console.error('Error sending telegram alert:', error);
    }
  }
}
