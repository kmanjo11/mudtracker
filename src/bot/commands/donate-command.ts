import TelegramBot from 'node-telegram-bot-api'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { DONATE_MENU, SUB_MENU } from '../../config/bot-menus'
import { DonateMessages } from '../messages/donate-messages'
import { PrismaUserRepository } from '../../repositories/prisma/user'
import { Payments } from '../../lib/payments'
import { Command } from '../types'

export class DonateCommand implements Command {
  private prismaUserRepository: PrismaUserRepository
  private payments: Payments
  readonly name = 'donate'
  readonly description = 'Make a donation'
  constructor(private bot: TelegramBot) {
    this.bot = bot
    this.prismaUserRepository = new PrismaUserRepository()
    this.payments = new Payments()
  }
  async execute(ctx: Context<Update>): Promise<void> {
    const userId = ctx.from?.id.toString()
    if (!userId) return

    const user = await this.prismaUserRepository.getUserPlan(userId)
    const messageText = DonateMessages.donateMessage(user?.personalWalletPubKey)

    if (ctx.callbackQuery) {
      await ctx.editMessageText(messageText, {
        parse_mode: 'HTML',
        reply_markup: DONATE_MENU
      })
    } else {
      await ctx.reply(messageText, {
        parse_mode: 'HTML',
        reply_markup: DONATE_MENU
      })
    }
  }
  async handleCallback(ctx: Context<Update>): Promise<void> {
    await this.execute(ctx)
  }
}
