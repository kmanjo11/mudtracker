import { Connection, PublicKey, LogsFilter, Logs } from '@solana/web3.js'
import { ValidTransactions } from './valid-transactions'
import EventEmitter from 'events'
import { TransactionParser } from '../parsers/transaction-parser'
import { SendTransactionMsgHandler } from '../bot/handlers/send-tx-msg-handler'
import { bot } from '../providers/telegram'
import { SwapPlatform, SwapType, WalletWithUsers } from '../types/swap-types'
import { RateLimit } from './rate-limit'
import {
  JUPITER_PROGRAM_ID,
  PUMP_FUN_PROGRAM_ID,
  PUMP_FUN_TOKEN_MINT_AUTH,
  RAYDIUM_PROGRAM_ID,
} from '../config/program-ids'
import chalk from 'chalk'
import { RpcConnectionManager } from '../providers/solana'
import { NativeParserInterface } from '../types/general-interfaces'
import pLimit from 'p-limit'
import { CronJobs } from './cron-jobs'
import { PrismaUserRepository } from '../repositories/prisma/user'

export const trackedWallets: Set<string> = new Set()

export class WatchTransaction extends EventEmitter {
  public subscriptions: Map<string, number>

  private walletTransactions: Map<string, { count: number; startTime: number }>
  private excludedWallets: Map<string, boolean>

  private rateLimit: RateLimit

  private prismaUserRepository: PrismaUserRepository
  constructor() {
    super()

    this.subscriptions = new Map()
    this.walletTransactions = new Map()
    this.excludedWallets = new Map()

    // this.trackedWallets = new Set()

    this.rateLimit = new RateLimit(this.subscriptions)

    this.prismaUserRepository = new PrismaUserRepository()
  }

  public async watchSocket(wallets: WalletWithUsers[]): Promise<void> {
    try {
      for (const wallet of wallets) {
        const publicKey = new PublicKey(wallet.address)
        const walletAddress = publicKey.toBase58()

        // Check if a subscription already exists for this wallet address
        if (this.subscriptions.has(walletAddress)) {
          // console.log(`Already watching for: ${walletAddress}`)
          continue // Skip re-subscribing
        }

        console.log(chalk.greenBright(`Watching transactions for wallet: `) + chalk.yellowBright.bold(walletAddress))

        // Initialize transaction count and timestamp
        this.walletTransactions.set(walletAddress, { count: 0, startTime: Date.now() })

        // Start real-time log
        const subscriptionId = RpcConnectionManager.logConnection.onLogs(
          publicKey,
          async (logs, ctx) => {
            // Exclude wallets that have reached the limit
            if (this.excludedWallets.has(walletAddress)) {
              console.log(`Wallet ${walletAddress} is excluded from logging.`)
              return
            }

            // if (wallet.userWallets[0].status === 'SPAM_PAUSED') {
            //   console.log('PAUSED TRANSACTIONS FOR: ', walletAddress)
            //   return
            // }

            const { isRelevant, swap } = this.isRelevantTransaction(logs)

            if (!isRelevant) {
              // console.log('TRANSACTION IS NOT DEFI', logs.signature)
              return
            }
            // console.log('TRANSACTION IS DEFI', logs.signature)
            // check txs per second
            const walletData = this.walletTransactions.get(walletAddress)
            if (!walletData) {
              return
            }

            const isWalletRateLimited = await this.rateLimit.txPerSecondCap({
              wallet,
              bot,
              excludedWallets: this.excludedWallets,
              walletData,
            })

            if (isWalletRateLimited) {
              return
            }

            const transactionSignature = logs.signature

            const randomConnection = RpcConnectionManager.getRandomConnection()

            const transactionDetails = await this.getParsedTransaction(transactionSignature)

            if (!transactionDetails || transactionDetails[0] === null) {
              return
            }

            // Parse transaction
            const solPriceUsd = CronJobs.getSolPrice()
            const transactionParser = new TransactionParser(transactionSignature)
            const parsed = await transactionParser.parseRpc(transactionDetails, swap, solPriceUsd)

            if (!parsed) {
              // console.log('NO PARSED')
              return
            }

            console.log(parsed.description)

            // Use bot to send message of transaction
            await this.sendMessagesToUsers(wallet, parsed)
          },
          'processed',
        )

        // Store subscription ID
        this.subscriptions.set(wallet.address, subscriptionId)
        console.log(
          chalk.greenBright(`Subscribed to logs with subscription ID: `) + chalk.yellowBright.bold(subscriptionId),
        )
      }
    } catch (error) {
      console.error('Error in watchSocket:', error)
    }
  }

  public async getParsedTransaction(transactionSignature: string, retries = 4) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const transactionDetails = await RpcConnectionManager.connections[1].getParsedTransactions(
          [transactionSignature],
          {
            maxSupportedTransactionVersion: 0,
          },
        )

        if (transactionDetails && transactionDetails[0] !== null) {
          return transactionDetails
        }

        console.log(`Attempt ${attempt}: No transaction details found for ${transactionSignature}`)
      } catch (error) {
        console.error(`Attempt ${attempt}: Error fetching transaction details`, error)
      }

      // Delay before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }

    console.error(`Failed to fetch transaction details after ${retries} retries for signature:`, transactionSignature)
    return null
  }

  private async sendMessagesToUsers(wallet: WalletWithUsers, parsed: NativeParserInterface) {
    const sendMessageHandler = new SendTransactionMsgHandler(bot)

    const pausedUsers = (await this.prismaUserRepository.getPausedUsers(wallet.userWallets.map((w) => w.userId))) || []

    const activeUsers = wallet.userWallets.filter(
      (w) => !pausedUsers || !pausedUsers.includes(w.userId), // Include only non-paused users
    )

    // just in case, somehow sometimes I get duplicated users here, I should probably address this in the track wallets function instead
    const uniqueActiveUsers = Array.from(new Set(activeUsers.map((user) => user.userId))).map((userId) =>
      activeUsers.find((user) => user.userId === userId),
    )

    const limit = pLimit(30)

    const tasks = uniqueActiveUsers.map((user) =>
      limit(async () => {
        if (user) {
          // console.log('Users:', user)
          try {
            // Convert threadId to undefined if null
            const threadId = user.threadId ?? undefined;
            await sendMessageHandler.send(parsed, user.userId, threadId)
          } catch (error) {
            console.log(`Error sending message to user ${user.userId}`)
          }
        }
      }),
    )

    await Promise.all(tasks)
  }

  private isRelevantTransaction(logs: Logs): { isRelevant: boolean; swap: SwapType } {
    if (!logs.logs || logs.logs.length === 0) {
      return { isRelevant: false, swap: null }
    }

    const logString = logs.logs.join(' ')

    if (logString.includes(PUMP_FUN_TOKEN_MINT_AUTH)) {
      return { isRelevant: true, swap: SwapPlatform.MINT_PUMPFUN }
    }
    if (logString.includes(PUMP_FUN_PROGRAM_ID)) {
      return { isRelevant: true, swap: SwapPlatform.PUMPFUN }
    }
    if (logString.includes(JUPITER_PROGRAM_ID)) {
      return { isRelevant: true, swap: SwapPlatform.JUPITER }
    }
    if (logString.includes(RAYDIUM_PROGRAM_ID)) {
      return { isRelevant: true, swap: SwapPlatform.RAYDIUM }
    }

    return { isRelevant: false, swap: null }
  }
}
