import { Context, Telegraf } from 'telegraf'
import { Update, Message } from 'telegraf/typings/core/types/typegram'
import TelegramBot from 'node-telegram-bot-api'
import { Command } from '../types'

export interface MessageExtra {
  parse_mode?: 'Markdown' | 'HTML'
  reply_markup?: any
}

export abstract class BaseCommand implements Command {
  abstract readonly name: string
  abstract readonly description: string

  constructor(protected bot: Telegraf<Context<Update>> | TelegramBot) {}

  protected isTelegraf(bot: Telegraf<Context<Update>> | TelegramBot): bot is Telegraf<Context<Update>> {
    return 'telegram' in bot
  }

  protected async editMessage(
    ctx: Context<Update>,
    text: string,
    extra?: MessageExtra
  ): Promise<void> {
    try {
      const chatId = ctx.chat?.id
      if (!chatId) return

      if ('callback_query' in ctx.update) {
        const messageId = ctx.callbackQuery?.message?.message_id
        if (messageId) {
          if (this.isTelegraf(this.bot)) {
            await ctx.editMessageText(text, extra)
          } else {
            await this.bot.editMessageText(text, {
              chat_id: chatId,
              message_id: messageId,
              ...extra
            })
          }
        }
      } else {
        if (this.isTelegraf(this.bot)) {
          await ctx.reply(text, extra)
        } else {
          await this.bot.sendMessage(chatId, text, extra)
        }
      }
    } catch (error) {
      console.error(`Error in ${this.name}:`, error)
      await this.handleError(ctx, error)
    }
  }

  protected async handleError(ctx: Context<Update>, error: any): Promise<void> {
    const errorMessage = error?.message || 'An error occurred. Please try again.'
    
    try {
      const chatId = ctx.chat?.id
      if (!chatId) return

      if ('callback_query' in ctx.update) {
        const queryId = ctx.callbackQuery?.id
        if (queryId) {
          if (this.isTelegraf(this.bot)) {
            await ctx.answerCbQuery(errorMessage.slice(0, 200))
          } else {
            await this.bot.answerCallbackQuery(queryId, errorMessage.slice(0, 200))
          }
        }
      }

      if (this.isTelegraf(this.bot)) {
        await ctx.reply(errorMessage)
      } else {
        await this.bot.sendMessage(chatId, errorMessage)
      }
    } catch (replyError) {
      console.error(`Failed to send error message in ${this.name}:`, replyError)
    }
  }

  abstract execute(ctx: Context<Update>): Promise<void>
  abstract handleCallback?(ctx: Context<Update>): Promise<void>
}
