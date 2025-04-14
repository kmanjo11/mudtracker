import { Telegraf } from 'telegraf'
import { config } from 'dotenv'
import { CallbackQueryHandler } from './bot/handlers/callback-query-handler'
import { UserSettingsService } from './services/user/user-settings-service'

// Services
import { WalletService } from './services/wallet/wallet-service'
import { UserService } from './services/user/user-service'
import { LiquidityService } from './services/trading/liquidity-service'
import { TradingService } from './services/trading/trading-service'
import { ChartService } from './services/analytics/chart-service'
import { DexTradeService } from './services/analytics/dex-trade-service'
import { ChatManager } from './services/chat/chat-manager'
import { RpcConnectionManager } from './providers/solana'

// Commands
import { StartCommand } from './bot/commands/start-command'
import { LiquidityCommand } from './bot/commands/liquidity-command'
import { TradeCommand } from './bot/commands/trade-command'
import { SettingsCommand } from './bot/commands/settings-command'
import { LeverageCommand } from './bot/commands/leverage-command'
import { ChartUICommand } from './bot/commands/chart-ui-command'

// Load environment variables
config()

// Initialize bot with token
const bot = new Telegraf(process.env.BOT_TOKEN || '')

// Initialize services
const userSettings = new UserSettingsService()
const tradingService = new TradingService(RpcConnectionManager.getRandomConnection())
const dexTradeService = new DexTradeService();
const chartService = new ChartService(dexTradeService);
const chatManager = new ChatManager()

// Register commands
const startCommand = new StartCommand(bot)
const tradeCommand = new TradeCommand(bot, tradingService)
const chartUICommand = new ChartUICommand(bot, chartService);
const liquidityCommand = new LiquidityCommand(bot, new LiquidityService(RpcConnectionManager.getRandomConnection()))
const settingsCommand = new SettingsCommand(bot, userSettings, chatManager)
const leverageCommand = new LeverageCommand(bot, tradingService, new WalletService(RpcConnectionManager.getRandomConnection()))

bot.command('start', (ctx) => startCommand.execute(ctx))
bot.command('help', (ctx) => startCommand.execute(ctx))
bot.command('trade', (ctx) => tradeCommand.execute(ctx))
bot.command('charts', (ctx) => chartUICommand.execute(ctx))
bot.command('liquidity', (ctx) => liquidityCommand.execute(ctx))
bot.command('settings', (ctx) => settingsCommand.execute(ctx))
bot.command('leverage', (ctx) => leverageCommand.execute(ctx))

// Initialize and register callback handler
const callbackHandler = new CallbackQueryHandler(bot, userSettings)
callbackHandler.call()

// Start bot
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
