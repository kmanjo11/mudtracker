import TelegramBot from 'node-telegram-bot-api'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { PrismaWalletRepository } from '../../repositories/prisma/wallet'
import { DeleteMessages } from '../messages/delete-messages'
import { DELETE_SUB_MENU } from '../../config/bot-menus'
import { BotMiddleware } from '../../config/bot-middleware'
import { Command } from '../types'

export class DeleteCommand implements Command {
  private prismaWalletRepository: PrismaWalletRepository

  readonly name = 'delete'
  readonly description = 'Delete tracked wallets'

  constructor(private bot: TelegramBot) {
    this.bot = bot
    this.prismaWalletRepository = new PrismaWalletRepository()
  }

  async execute(ctx: Context<Update>): Promise<void> {
    const userId = ctx.from?.id.toString()
    if (!userId) return

    const userWallets = await this.prismaWalletRepository.getUserWallets(userId)
    const messageText = DeleteMessages.deleteMessage(userWallets || [])

    if (ctx.callbackQuery) {
      await ctx.editMessageText(messageText, {
        reply_markup: BotMiddleware.isGroup(Number(userId)) ? undefined : DELETE_SUB_MENU,
        parse_mode: 'HTML'
      })
    } else {
      await ctx.reply(messageText, {
        reply_markup: BotMiddleware.isGroup(Number(userId)) ? undefined : DELETE_SUB_MENU,
        parse_mode: 'HTML'
      })
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    await this.execute(ctx)
  }
}
