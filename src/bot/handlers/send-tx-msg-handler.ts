import TelegramBot from 'node-telegram-bot-api'
import { TokenPrices } from '../../lib/token-prices-api'
import { FormatNumbers } from '../../lib/format-numbers'
import { createTxSubMenu } from '../../config/bot-menus'
import { TxMessages } from '../messages/tx-messages'
import { PrismaWalletRepository } from '../../repositories/prisma/wallet'
import { NativeParserInterface, TransactionType } from '../../types/general-interfaces'

export class SendTransactionMsgHandler {
  private tokenPrices: TokenPrices
  private prismaWalletRepository: PrismaWalletRepository
  constructor(private bot: TelegramBot) {
    this.bot = bot
    this.tokenPrices = new TokenPrices()
    this.prismaWalletRepository = new PrismaWalletRepository()
  }

  public async send(message: NativeParserInterface, chatId: string, threadId?: number) {
    // Get first token transfer since we're dealing with arrays
    const tokenTransfer = message.tokenTransfers[0]
    if (!tokenTransfer) return

    const tokenToMc = message.type === TransactionType.SWAP ? tokenTransfer.tokenInMint : tokenTransfer.tokenOutMint
    const tokenToMcSymbol = message.type === TransactionType.SWAP ? tokenTransfer.tokenInSymbol : tokenTransfer.tokenOutSymbol

    const TX_SUB_MENU = createTxSubMenu(tokenToMcSymbol, tokenToMc)

    const walletName = await this.prismaWalletRepository.getUserWalletNameById(chatId, message.owner)

    if (!walletName?.address || !message.owner) {
      console.log('Address not found in user wallets')
      return
    }

    try {
      if (message.platform === 'raydium' || message.platform === 'jupiter') {
        let tokenMarketCap = message.swappedTokenMc

        if (tokenMarketCap && tokenMarketCap < 1000) {
          console.log('MC ADJUSTED')
          tokenMarketCap *= 1000
        }

        const formattedMarketCap = tokenMarketCap ? FormatNumbers.formatPrice(tokenMarketCap) : undefined
        const tokenPrice = message.swappedTokenPrice

        const messageText = TxMessages.txMadeMessage(message, formattedMarketCap, walletName?.name)
        return this.bot.sendMessage(chatId, messageText, {
          message_thread_id: threadId,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: TX_SUB_MENU,
        })
      } else if (message.platform === 'pumpfun') {
        let tokenMarketCap = message.swappedTokenMc

        const formattedMarketCap = tokenMarketCap ? FormatNumbers.formatPrice(tokenMarketCap) : undefined

        const messageText = TxMessages.txMadeMessage(message, formattedMarketCap, walletName?.name)
        return this.bot.sendMessage(chatId, messageText, {
          message_thread_id: threadId,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: TX_SUB_MENU,
        })
      } else if (message.platform === 'mint_pumpfun') {
        const messageText = TxMessages.tokenMintedMessage(message, walletName?.name)

        return this.bot.sendMessage(chatId, messageText, {
          message_thread_id: threadId,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: TX_SUB_MENU,
        })
      }
    } catch (error: any) {
      if (error.response && error.response.statusCode === 403) {
        console.log(`User ${chatId} has blocked the bot or chat no longer exists`)
      } else {
        console.log(`Failed to send message to ${chatId}:`, error)
      }
    }

    return
  }
}
