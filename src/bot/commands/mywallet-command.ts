import TelegramBot from 'node-telegram-bot-api'
import { Context, Telegraf } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { PrismaUserRepository } from '../../repositories/prisma/user'
import { USER_WALLET_SUB_MENU } from '../../config/bot-menus'
import { WalletMessages } from '../messages/wallet-messages'
import { Command } from '../types'
import { BaseCommand } from './base-command'
import { WalletStatsService } from '../../services/wallet/wallet-stats-service'
import { RpcConnectionManager } from '../../providers/solana'
import { TokenService } from '../../services/wallet/token-service'

export class MyWalletCommand extends BaseCommand implements Command {
  private prismaUserRepository: PrismaUserRepository
  private walletMessages: WalletMessages
  private walletStatsService: WalletStatsService
  private tokenService: TokenService
  readonly name = 'mywallet'
  readonly description = 'View your wallet details'
  
  constructor(bot: Telegraf<Context<Update>>) {
    super(bot)
    this.prismaUserRepository = new PrismaUserRepository()
    this.walletMessages = new WalletMessages()
    this.walletStatsService = new WalletStatsService(RpcConnectionManager.connections[0])
    this.tokenService = new TokenService(RpcConnectionManager.connections[0])
  }
  
  async execute(ctx: Context<Update>): Promise<void> {
    try {
      const userId = ctx.from?.id.toString()
      if (!userId) {
        await this.handleError(ctx, new Error('User ID not found'))
        return
      }

      const userPersonalWallet = await this.prismaUserRepository.getPersonalWallet(userId)
      if (!userPersonalWallet) {
        await this.handleError(ctx, new Error('Wallet not found'))
        return
      }

      // Show loading message
      const loadingMessage = await ctx.reply('Loading wallet details...')

      // Get wallet message
      const messageText = await this.walletMessages.sendMyWalletMessage(userPersonalWallet)

      // Create wallet menu with additional options
      const walletMenu = {
        inline_keyboard: [
          [
            { text: '💰 Tokens', callback_data: 'wallet:tokens' },
            { text: '📊 Stats', callback_data: 'wallet:stats' }
          ],
          [
            { text: '🔄 Refresh', callback_data: 'wallet:refresh' },
            { text: '📜 Transactions', callback_data: 'wallet:transactions' }
          ],
          [
            { text: '💱 Swap', callback_data: 'wallet:swap' },
            { text: '💸 Send', callback_data: 'wallet:send' }
          ],
          [
            { text: '🏦 Deposit', callback_data: 'wallet:deposit' },
            { text: '🔙 Back to Menu', callback_data: 'main:menu' }
          ]
        ]
      }

      // Delete loading message and send wallet details
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id)
      
      if (ctx.callbackQuery) {
        await ctx.editMessageText(messageText, {
          reply_markup: walletMenu,
          parse_mode: 'HTML'
        })
      } else {
        await ctx.reply(messageText, {
          reply_markup: walletMenu,
          parse_mode: 'HTML'
        })
      }
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
  
  async handleCallback(ctx: Context<Update>): Promise<void> {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
        await this.handleError(ctx, new Error('Invalid callback query'))
        return
      }

      const userId = ctx.from?.id.toString()
      if (!userId) {
        await this.handleError(ctx, new Error('User ID not found'))
        return
      }

      const data = ctx.callbackQuery.data
      const [section, action, ...params] = data.split(':')
      
      if (section === 'wallet') {
        switch (action) {
          case 'refresh':
            await this.execute(ctx)
            break
            
          case 'stats':
            await this.showWalletStats(ctx, userId)
            break
            
          case 'tokens':
            await this.showTokenList(ctx, userId)
            break
            
          case 'transactions':
            await this.showTransactions(ctx, userId)
            break
            
          case 'token':
            if (params.length > 0) {
              await this.showTokenDetails(ctx, userId, params[0])
            }
            break
            
          case 'swap':
            await this.showSwapInterface(ctx, userId)
            break
            
          case 'send':
            await this.showSendInterface(ctx, userId)
            break
            
          case 'deposit':
            await this.showDepositInstructions(ctx, userId)
            break
            
          default:
            await this.execute(ctx)
        }
      } else if (section === 'main' && action === 'menu') {
        // Handle back to main menu
        await ctx.editMessageText('Returning to main menu...', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Please wait...', callback_data: 'loading' }]]
          }
        })
        
        // Simulate returning to main menu
        await ctx.answerCbQuery('Returning to main menu')
      }
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
  
  private async showWalletStats(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId)
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'))
        return
      }
      
      // Get wallet stats
      const walletStats = await this.walletStatsService.getWalletStats(userWallet.personalWalletPubKey)
      const formattedStats = this.walletStatsService.formatWalletStats(walletStats)
      
      // Get top tokens summary
      const topTokens = await this.walletStatsService.getTopTokensSummary(userWallet.personalWalletPubKey)
      
      const messageText = `${formattedStats}\n\n${topTokens}`
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh Stats', callback_data: 'wallet:stats' },
            { text: '💰 View All Tokens', callback_data: 'wallet:tokens' }
          ],
          [
            { text: '🔙 Back to Wallet', callback_data: 'wallet:refresh' }
          ]
        ]
      }
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      })
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
  
  private async showTokenList(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId)
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'))
        return
      }
      
      // Get token balances
      const tokenBalances = await this.tokenService.getTokenBalancesWithPrices(userWallet.personalWalletPubKey)
      
      // Sort by value (highest first)
      const sortedBalances = [...tokenBalances].sort((a, b) => (b.value || 0) - (a.value || 0))
      
      let messageText = '<b>🪙 Your Tokens</b>\n\n'
      
      if (sortedBalances.length === 0) {
        messageText += 'No tokens found in this wallet.'
      } else {
        for (const token of sortedBalances) {
          const valueStr = token.value ? `$${(token.value).toFixed(2)}` : 'N/A'
          messageText += `• <b>${token.symbol}</b>: ${token.uiAmount.toFixed(6)} (${valueStr})\n`
        }
      }
      
      // Create token buttons (up to 5 tokens)
      const tokenButtons = sortedBalances.slice(0, 5).map(token => ({
        text: token.symbol,
        callback_data: `wallet:token:${token.mint}`
      }))
      
      // Split into rows of 2 buttons
      const tokenRows = []
      for (let i = 0; i < tokenButtons.length; i += 2) {
        tokenRows.push(tokenButtons.slice(i, i + 2))
      }
      
      const menu = {
        inline_keyboard: [
          ...tokenRows,
          [
            { text: '🔄 Refresh', callback_data: 'wallet:tokens' },
            { text: '🔙 Back to Wallet', callback_data: 'wallet:refresh' }
          ]
        ]
      }
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      })
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
  
  private async showTokenDetails(ctx: Context<Update>, userId: string, tokenMint: string): Promise<void> {
    try {
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId)
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'))
        return
      }
      
      // Get token details
      const messageText = await this.walletMessages.sendTokenDetailsMessage(
        userWallet.personalWalletPubKey,
        tokenMint
      )
      
      const menu = {
        inline_keyboard: [
          [
            { text: '💱 Swap', callback_data: `swap:init:${tokenMint}` },
            { text: '💸 Send', callback_data: `send:init:${tokenMint}` }
          ],
          [
            { text: '🔄 Refresh', callback_data: `wallet:token:${tokenMint}` },
            { text: '🔙 Back to Tokens', callback_data: 'wallet:tokens' }
          ]
        ]
      }
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      })
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
  
  private async showTransactions(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId)
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'))
        return
      }
      
      // Get transaction history
      const messageText = await this.walletMessages.sendWalletTransactionsMessage(
        userWallet.personalWalletPubKey
      )
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: 'wallet:transactions' },
            { text: '🔙 Back to Wallet', callback_data: 'wallet:refresh' }
          ]
        ]
      }
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      })
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
  
  private async showSwapInterface(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      const messageText = `
<b>💱 Token Swap</b>

Use this interface to swap between tokens in your wallet.

<b>How to swap:</b>
1. Select the token you want to swap from
2. Select the token you want to swap to
3. Enter the amount you want to swap
4. Review and confirm the transaction

<i>Note: This feature will be fully implemented soon.</i>
`
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🔙 Back to Wallet', callback_data: 'wallet:refresh' }
          ]
        ]
      }
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      })
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
  
  private async showSendInterface(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      const messageText = `
<b>💸 Send Tokens</b>

Use this interface to send tokens to another wallet.

<b>How to send:</b>
1. Select the token you want to send
2. Enter the recipient's wallet address
3. Enter the amount you want to send
4. Review and confirm the transaction

<i>Note: This feature will be fully implemented soon.</i>
`
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🔙 Back to Wallet', callback_data: 'wallet:refresh' }
          ]
        ]
      }
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      })
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
  
  private async showDepositInstructions(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId)
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'))
        return
      }
      
      const messageText = `
<b>🏦 Deposit to Your Wallet</b>

To deposit funds to your wallet, send SOL or any SPL token to this address:

<code>${userWallet.personalWalletPubKey}</code>

<b>Important:</b>
• Make sure to send only Solana (SOL) or SPL tokens
• Double-check the address before sending
• Small deposits may take a few minutes to appear

<i>Tip: You can copy the address by tapping on it.</i>
`
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh Wallet', callback_data: 'wallet:refresh' },
            { text: '🔙 Back', callback_data: 'wallet:refresh' }
          ]
        ]
      }
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      })
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }
}
