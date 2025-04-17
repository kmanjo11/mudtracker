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
import { XFeedService } from './services/social/x-feed-service'

// Commands
import { StartCommand } from './bot/commands/start-command'
import { LiquidityCommand } from './bot/commands/liquidity-command'
import { TradeCommand } from './bot/commands/trade-command'
import { SettingsCommand } from './bot/commands/settings-command'
import { LeverageCommand } from './bot/commands/leverage-command'
import { ChartUICommand } from './bot/commands/chart-ui-command'
import { XFeedCommand } from './bot/commands/x-feed-command'

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
const xFeedService = new XFeedService()

// Register commands
const startCommand = new StartCommand(bot)
const tradeCommand = new TradeCommand(bot, tradingService)
const chartUICommand = new ChartUICommand(bot, chartService);
const liquidityCommand = new LiquidityCommand(bot, new LiquidityService(RpcConnectionManager.getRandomConnection()))
const settingsCommand = new SettingsCommand(bot, userSettings, chatManager)
const leverageCommand = new LeverageCommand(bot, tradingService, new WalletService(RpcConnectionManager.getRandomConnection()))
const xFeedCommand = new XFeedCommand(bot, xFeedService)

bot.command('start', (ctx) => startCommand.execute(ctx))
bot.command('help', (ctx) => startCommand.execute(ctx))
bot.command('trade', (ctx) => tradeCommand.execute(ctx))
bot.command('charts', (ctx) => chartUICommand.execute(ctx))
bot.command('liquidity', (ctx) => liquidityCommand.execute(ctx))
bot.command('settings', (ctx) => settingsCommand.execute(ctx))
bot.command('leverage', (ctx) => leverageCommand.execute(ctx))
bot.command('xfeed', (ctx) => xFeedCommand.execute(ctx))

// Add profile command handler
bot.command('add_profile', async (ctx) => {
  try {
    const text = ctx.message.text.trim();
    const parts = text.split(' ');
    
    if (parts.length < 2) {
      await ctx.reply('❌ Invalid format. Use: /add_profile username [display name] [category]');
      return;
    }
    
    const username = parts[1];
    const displayName = parts.length > 2 ? parts.slice(2, parts.length - 1).join(' ') : undefined;
    const category = parts.length > 3 ? parts[parts.length - 1] : undefined;
    
    const success = await xFeedService.addProfile(username, displayName, category);
    
    if (success) {
      await ctx.reply(`✅ Successfully added @${username} to your X Feed.`);
    } else {
      await ctx.reply(`❌ Failed to add @${username}. Profile may already exist.`);
    }
  } catch (error) {
    console.error('Error adding profile:', error);
    await ctx.reply('❌ An error occurred while adding the profile.');
  }
});

// Remove profile command handler
bot.command('remove_profile', async (ctx) => {
  try {
    const text = ctx.message.text.trim();
    const parts = text.split(' ');
    
    if (parts.length !== 2) {
      await ctx.reply('❌ Invalid format. Use: /remove_profile username');
      return;
    }
    
    const username = parts[1];
    const success = await xFeedService.removeProfile(username);
    
    if (success) {
      await ctx.reply(`✅ Successfully removed @${username} from your X Feed.`);
    } else {
      await ctx.reply(`❌ Failed to remove @${username}. Profile not found.`);
    }
  } catch (error) {
    console.error('Error removing profile:', error);
    await ctx.reply('❌ An error occurred while removing the profile.');
  }
});

// List profiles command handler
bot.command('list_profiles', async (ctx) => {
  try {
    const profiles = xFeedService.getProfiles();
    
    if (profiles.length === 0) {
      await ctx.reply('📭 No profiles in your X Feed.');
      return;
    }
    
    let message = '👥 *X Feed Profiles*\n\n';
    profiles.forEach((profile, index) => {
      message += `${index + 1}. @${profile.username}`;
      if (profile.displayName) {
        message += ` (${profile.displayName})`;
      }
      if (profile.category) {
        message += ` - ${profile.category}`;
      }
      message += '\n';
    });
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error listing profiles:', error);
    await ctx.reply('❌ An error occurred while listing profiles.');
  }
});

// Initialize and register callback handler
const callbackHandler = new CallbackQueryHandler(bot, userSettings)
callbackHandler.call()

// Start bot
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
