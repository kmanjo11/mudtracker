import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';

export abstract class BaseCommand {
  constructor(protected bot: Telegraf<Context<Update>>) {}

  protected async editMessage(ctx: Context<Update>, text: string, options?: any): Promise<void> {
    try {
      if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
        const message = ctx.callbackQuery.message;
        if ('chat' in message) {
          await ctx.telegram.editMessageText(
            message.chat.id,
            message.message_id,
            undefined,
            text,
            options
          );
        }
      } else {
        await ctx.reply(text, options);
      }
    } catch (error) {
      console.error('Error editing message:', error);
      // Try to send a new message if editing fails
      try {
        await ctx.reply(text, options);
      } catch (replyError) {
        console.error('Error sending reply after edit failure:', replyError);
      }
    }
  }

  protected async handleError(ctx: Context<Update>, error: any): Promise<void> {
    console.error(`Error in ${this.constructor.name}:`, error);
    
    try {
      const errorMessage = '❌ An error occurred. Please try again later.';
      
      if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
        await this.editMessage(ctx, errorMessage);
      } else {
        await ctx.reply(errorMessage);
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }

  protected async handleTradeAction(ctx: Context<Update>, action: string, tokenAddress?: string): Promise<void> {
    // Placeholder for trade actions
    await this.editMessage(ctx, 
      `*Trading Action*\n\n` +
      `Action: ${action}\n` +
      `Token: ${tokenAddress || 'Unknown'}\n\n` +
      `This feature is coming soon!`,
      { parse_mode: 'Markdown' }
    );
  }
}
