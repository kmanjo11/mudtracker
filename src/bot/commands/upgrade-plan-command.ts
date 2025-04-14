import TelegramBot from 'node-telegram-bot-api'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { SubscriptionMessages } from '../messages/subscription-messages'
import { UPGRADE_PLAN_SUB_MENU } from '../../config/bot-menus'
import { PrismaUserRepository } from '../../repositories/prisma/user'
import { Command } from '../types'

export class UpgradePlanCommand implements Command {
  private prismaUserRepository: PrismaUserRepository
  readonly name = 'upgrade'
  readonly description = 'Upgrade your subscription plan'
  constructor(private bot: TelegramBot) {
    this.bot = bot
    this.prismaUserRepository = new PrismaUserRepository()
  }
  async execute(ctx: Context<Update>): Promise<void> {
    const userId = ctx.from?.id.toString()
    if (!userId) return

    const user = await this.prismaUserRepository.getUserPlan(userId)
    const messageText = SubscriptionMessages.upgradeProMessage(user)

    if (ctx.callbackQuery) {
      await ctx.editMessageText(messageText, {
        reply_markup: UPGRADE_PLAN_SUB_MENU,
        parse_mode: 'HTML'
      })
    } else {
      await ctx.reply(messageText, {
        reply_markup: UPGRADE_PLAN_SUB_MENU,
        parse_mode: 'HTML'
      })
    }
  }
  async handleCallback(ctx: Context<Update>): Promise<void> {
    await this.execute(ctx)
  }
}
