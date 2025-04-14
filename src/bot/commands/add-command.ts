import { Context, Telegraf } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import TelegramBot from 'node-telegram-bot-api'
import { BaseCommand } from './base-command'
import { Command } from '../types'
import { SUB_MENU, UPGRADE_PLAN_SUB_MENU } from '../../config/bot-menus'
import { RateLimit } from '../../lib/rate-limit'
import { BotMiddleware } from '../middleware/bot-middleware'
import { PrismaWalletRepository } from '../../repositories/prisma/wallet'
import { UserPlan } from '../../services/user/user-plan'

export class AddCommand extends BaseCommand implements Command {
  readonly name = 'add'
  readonly description = 'Add a wallet to track'

  private rateLimit: RateLimit
  private botMiddleware: BotMiddleware
  private prismaWalletRepository: PrismaWalletRepository
  private userPlan: UserPlan

  constructor(bot: Telegraf<Context<Update>> | TelegramBot) {
    super(bot)
    this.rateLimit = new RateLimit(new Map())
    this.botMiddleware = new BotMiddleware()
    this.prismaWalletRepository = new PrismaWalletRepository()
    this.userPlan = new UserPlan()
  }

  async execute(ctx: Context<Update>): Promise<void> {
    if (!ctx.message || !('text' in ctx.message)) {
      return
    }

    const chatId = ctx.message.chat.id
    const text = ctx.message.text

    try {
      // Split and clean wallet addresses
      const walletAddresses = text
        .split(',')
        .map((entry: string) => entry.trim())
        .filter(Boolean)

      if (walletAddresses.length === 0) {
        await this.editMessage(ctx, '😿 Please provide at least one Solana wallet address')
        return
      }

      const userId = chatId.toString()

      // Check if user has reached wallet limit
      const planWallets = await this.userPlan.getUserPlanWallets(userId)
      const userWallets = await this.prismaWalletRepository.getUserWallets(userId)

      if (!userWallets) {
        await this.editMessage(ctx, '😿 Error fetching your wallets. Please try again.')
        return
      }

      if (userWallets.length >= planWallets) {
        await this.editMessage(ctx, 
          `😿 You've reached the maximum number of wallets (${planWallets}) for your current plan`,
          { reply_markup: UPGRADE_PLAN_SUB_MENU }
        )
        return
      }

      // Validate each wallet address
      for (const walletAddress of walletAddresses) {
        if (!this.isValidSolanaAddress(walletAddress)) {
          await this.editMessage(ctx, '😾 Address provided is not a valid Solana wallet')
          continue
        }

        // Check if wallet is already being tracked
        const isWalletAlready = await this.prismaWalletRepository.getUserWalletById(userId, walletAddress)

        if (isWalletAlready) {
          await this.editMessage(ctx, `🙀 You already follow the wallet: ${walletAddress}`)
          continue
        }

        // Add wallet to database
        await this.prismaWalletRepository.create(
          userId,
          walletAddress,
          walletAddress
        )

        await this.editMessage(ctx, `🎉 Wallet ${walletAddress} has been added.`)
      }
    } catch (error) {
      console.error('Error in add command:', error)
      await this.handleError(ctx, error)
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    if (!ctx.callbackQuery) return
    
    await this.editMessage(ctx,
      '🐱 Please send me the Solana wallet address you want to track',
      { reply_markup: SUB_MENU }
    )
  }

  private isValidSolanaAddress(address: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
  }
}
