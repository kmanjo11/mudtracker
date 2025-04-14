import { Telegraf, Context } from 'telegraf'
import TelegramBot from 'node-telegram-bot-api'
import { Message, CallbackQuery } from 'telegraf/typings/core/types/typegram'

export class TelegrafAdapter {
  private adaptedBot: Partial<TelegramBot>

  constructor(private bot: Telegraf<Context>) {
    this.adaptedBot = {
      sendMessage: async (chatId: number | string, text: string, options?: any) => {
        return this.bot.telegram.sendMessage(chatId, text, options)
      },
      editMessageText: async (text: string, options?: any) => {
        const { chat_id, message_id, ...rest } = options || {}
        return this.bot.telegram.editMessageText(
          chat_id,
          message_id,
          undefined,
          text,
          rest
        )
      },
      answerCallbackQuery: async (callbackQueryId: string, text?: string) => {
        return this.bot.telegram.answerCbQuery(callbackQueryId, text)
      },
      on: (event: string, listener: Function) => {
        if (event === 'callback_query') {
          this.bot.on('callback_query', (ctx) => {
            const query = ctx.callbackQuery as CallbackQuery
            return listener(query)
          })
        } else if (event === 'message') {
          this.bot.on('message', (ctx) => {
            const msg = ctx.message as Message
            return listener(msg)
          })
        }
        return this.adaptedBot
      },
      removeListener: (event: string, listener: Function) => {
        // Telegraf doesn't have direct removeListener equivalent
        // We'll need to re-initialize the bot's event handlers if needed
        if (this.bot) {
          this.bot.botInfo = undefined; // This will force re-initialization of handlers
        }
        return this.adaptedBot
      }
    } as TelegramBot
  }

  getAdapter(): TelegramBot {
    return this.adaptedBot as TelegramBot
  }

  // Helper methods to directly access Telegraf functionality
  async editMessageText(text: string, options: any): Promise<any> {
    const { chat_id, message_id, ...rest } = options || {}
    return this.bot.telegram.editMessageText(
      chat_id,
      message_id,
      undefined,
      text,
      rest
    )
  }
}
