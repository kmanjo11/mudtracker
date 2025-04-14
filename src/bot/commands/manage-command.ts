import TelegramBot from 'node-telegram-bot-api'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { PrismaWalletRepository } from '../../repositories/prisma/wallet'
import { TrackerMessages } from '../messages/tracker-messages'
import { MANAGE_SUB_MENU } from '../../config/bot-menus'
import { UserPlan } from '../../lib/user-plan'
import { BotMiddleware } from '../../config/bot-middleware'
import { Command } from '../types'

export class TrackerCommand implements Command {
  private prismaWalletRepository: PrismaWalletRepository
  private userPlan: UserPlan
  private trackerMessages: TrackerMessages

  readonly name = 'manage'
  readonly description = 'Track and manage your wallets'

  constructor(private bot: TelegramBot) {
    this.bot = bot
    this.prismaWalletRepository = new PrismaWalletRepository()
    this.userPlan = new UserPlan()
    this.trackerMessages = new TrackerMessages()
  }

  async execute(ctx: Context<Update>): Promise<void> {
    const userId = ctx.from?.id.toString()
    if (!userId) return

    const userWallets = await this.prismaWalletRepository.getUserWallets(userId)
    const planWallets = await this.userPlan.getUserPlanWallets(userId)
    const messageText = TrackerMessages.trackerMessage(userWallets || [], planWallets)

    if (ctx.callbackQuery) {
      await ctx.editMessageText(messageText, {
        reply_markup: BotMiddleware.isGroup(Number(userId)) ? undefined : MANAGE_SUB_MENU,
        parse_mode: 'HTML'
      })
    } else {
      await ctx.reply(messageText, {
        reply_markup: BotMiddleware.isGroup(Number(userId)) ? undefined : MANAGE_SUB_MENU,
        parse_mode: 'HTML'
      })
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    await this.execute(ctx)
  }
}
