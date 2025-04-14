import TelegramBot from 'node-telegram-bot-api'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { PrismaUserRepository } from '../../repositories/prisma/user'
import { SUB_MENU, USER_WALLET_SUB_MENU } from '../../config/bot-menus'
import { WalletMessages } from '../messages/wallet-messages'
import { Command } from '../types'

export class MyWalletCommand implements Command {
  private prismaUserRepository: PrismaUserRepository
  private walletMessages: WalletMessages
  readonly name = 'mywallet'
  readonly description = 'View your wallet details'
  constructor(private bot: TelegramBot) {
    this.bot = bot
    this.prismaUserRepository = new PrismaUserRepository()
    this.walletMessages = new WalletMessages()
  }
  async execute(ctx: Context<Update>): Promise<void> {
    const userId = ctx.from?.id.toString()
    if (!userId) return

    const userPersonalWallet = await this.prismaUserRepository.getPersonalWallet(userId)
    if (!userPersonalWallet) return

    const messageText = await this.walletMessages.sendMyWalletMessage(userPersonalWallet)

    if (ctx.callbackQuery) {
      await ctx.editMessageText(messageText, {
        reply_markup: USER_WALLET_SUB_MENU,
        parse_mode: 'HTML'
      })
    } else {
      await ctx.reply(messageText, {
        reply_markup: USER_WALLET_SUB_MENU,
        parse_mode: 'HTML'
      })
    }
  }
  async handleCallback(ctx: Context<Update>): Promise<void> {
    await this.execute(ctx)
  }
}
