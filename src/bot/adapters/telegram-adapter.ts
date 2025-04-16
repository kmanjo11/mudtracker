import { Telegraf, Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'

/**
 * Direct Telegraf implementation without adapter pattern
 * This simplifies the bot implementation by using only Telegraf
 * and removing the unnecessary complexity of the adapter pattern
 */
export class TelegramService {
  constructor(private bot: Telegraf<Context<Update>>) {}

  async sendMessage(chatId: number | string, text: string, options?: any): Promise<any> {
    return this.bot.telegram.sendMessage(chatId, text, options);
  }

  async editMessageText(chatId: number | string, messageId: number, text: string, options?: any): Promise<any> {
    return this.bot.telegram.editMessageText(
      chatId,
      messageId,
      undefined,
      text,
      options
    );
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<any> {
    return this.bot.telegram.answerCbQuery(callbackQueryId, text);
  }

  async sendPhoto(chatId: number | string, photo: any, options?: any): Promise<any> {
    return this.bot.telegram.sendPhoto(chatId, photo, options);
  }

  async deleteMessage(chatId: number | string, messageId: number): Promise<any> {
    return this.bot.telegram.deleteMessage(chatId, messageId);
  }

  onCallbackQuery(handler: (ctx: Context<Update>) => Promise<void>): void {
    this.bot.on('callback_query', handler);
  }

  onMessage(handler: (ctx: Context<Update>) => Promise<void>): void {
    this.bot.on('message', handler);
  }

  onCommand(command: string, handler: (ctx: Context<Update>) => Promise<void>): void {
    this.bot.command(command, handler);
  }

  // Get the underlying Telegraf instance if needed
  getBot(): Telegraf<Context<Update>> {
    return this.bot;
  }
}
