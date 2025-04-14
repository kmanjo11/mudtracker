import TelegramBot from 'node-telegram-bot-api'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { HelpMessages } from '../messages/help-messages'
import { SUB_MENU } from '../../config/bot-menus'
import { Command } from '../types'

export class HelpCommand implements Command {
  readonly name = 'help'
  readonly description = 'Get help with bot commands'
  constructor(private bot: TelegramBot) {
    this.bot = bot
  }
  async execute(ctx: Context<Update>): Promise<void> {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(HelpMessages.generalHelp, {
        parse_mode: 'HTML',
        reply_markup: SUB_MENU
      })
    } else {
      await ctx.reply(HelpMessages.generalHelp, {
        parse_mode: 'HTML',
        reply_markup: SUB_MENU
      })
    }
  }
  async handleCallback(ctx: Context<Update>): Promise<void> {
    await this.execute(ctx)
  }
}
