import { Context, Telegraf } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import TelegramBot from 'node-telegram-bot-api'
import { BaseCommand } from './base-command'
import { START_MENU, TRADE_MENU } from '../../config/bot-menus'
import { welcomeMessage } from '../messages/welcome-messages'
import { TokenScanner } from '../../services/scanner/token-scanner'
import { UserPreferences } from '../../services/user/user-preferences'
import { ChatManager } from '../../services/chat/chat-manager'
import { ScannerCommand } from './scanner-command'
import { WalletService } from '../../services/wallet/wallet-service'
import { RpcConnectionManager } from '../../providers/solana'
import { ConnectWalletCommand } from './connect-wallet-command'
import { UserSettingsService } from '../../services/user/user-settings-service'
import { SettingsCommand } from './settings-command'
import { HelpMessages } from '../messages/help-messages'
import { NitterService } from '../../services/social/nitter-service'
import { GmgnService } from '../../services/analytics/gmgn-service'

export class StartCommand extends BaseCommand {
  readonly name = 'start'
  readonly description = 'Start the bot and show main menu'

  constructor(bot: Telegraf<Context<Update>> | TelegramBot) {
    super(bot)
    if (this.isTelegraf(bot)) {
      // Set up menu commands for Telegram
      bot.telegram.setMyCommands([
        { command: 'start', description: 'Start the bot and show main menu' },
        { command: 'scanner', description: 'Configure token scanner' },
        { command: 'wallet', description: 'Manage your wallet' },
        { command: 'settings', description: 'Configure bot settings' },
        { command: 'help', description: 'Get help with bot commands' }
      ])
    }
  }

  async execute(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id
      if (!chatId) return

      // Handle both /start command and menu button clicks
      if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
        const command = ctx.message.text.split(' ')[0].substring(1)
        await this.handleCommand(ctx, command)
      } else {
        await this.showMainMenu(ctx)
      }
    } catch (error) {
      await this.handleError(ctx, error)
    }
  }

  private async showMainMenu(ctx: Context): Promise<void> {
    await this.editMessage(ctx, welcomeMessage.text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: welcomeMessage.keyboard
      }
    })
  }

  private async handleCommand(ctx: Context, command: string): Promise<void> {
    switch (command) {
      case 'start':
        await this.showMainMenu(ctx)
        break
      case 'scanner':
        const tokenScanner = new TokenScanner(
          RpcConnectionManager.getRandomConnection(),
          new NitterService(),
          new GmgnService(RpcConnectionManager.getRandomConnection()),
          new ChatManager(),
          this.bot
        )
        const userPrefs = new UserPreferences()
        const chatManager = new ChatManager()
        const scannerCommand = new ScannerCommand(this.bot, tokenScanner, userPrefs, chatManager)
        await scannerCommand.execute(ctx)
        break
      case 'wallet':
        const walletService = new WalletService(RpcConnectionManager.getRandomConnection())
        const connectCommand = new ConnectWalletCommand(this.bot, walletService)
        await connectCommand.execute(ctx)
        break
      case 'settings':
        const userSettings = new UserSettingsService()
        const settingsCommand = new SettingsCommand(this.bot, userSettings, new ChatManager())
        await settingsCommand.execute(ctx)
        break
      case 'trade':
        await this.editMessage(ctx, '*💹 Trading Options*\n\nSelect your preferred trading method:', {
          parse_mode: 'Markdown',
          reply_markup: TRADE_MENU
        })
        break
      case 'help':
        await this.editMessage(ctx, HelpMessages.generalHelp, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_to_main' }]]
          }
        })
        break
      default:
        await this.showMainMenu(ctx)
    }
  }

  async handleCallback(ctx: Context): Promise<void> {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const action = ctx.callbackQuery.data;
      
      // Always answer callback query first to remove loading state
      await ctx.answerCbQuery();

      switch (action) {
        case 'trade':
          await this.editMessage(ctx, '*💹 Trading Options*\n\nSelect your preferred trading method:', {
            parse_mode: 'Markdown',
            reply_markup: TRADE_MENU
          });
          break;

        case 'spot_trading':
        case 'new_spot_order':
        case 'view_spot_orders':
          await this.handleSpotTrading(ctx, action);
          break;

        case 'leverage_trading':
        case 'new_leverage_position':
        case 'view_leverage_positions':
          await this.handleLeverageTrading(ctx, action);
          break;

        case 'liquidity_pool':
        case 'add_liquidity':
        case 'remove_liquidity':
          await this.handleLiquidityPool(ctx, action);
          break;

        case 'back_to_main':
          await this.showMainMenu(ctx);
          break;

        case 'back_to_trading':
          await this.editMessage(ctx, '*💹 Trading Options*\n\nSelect your preferred trading method:', {
            parse_mode: 'Markdown',
            reply_markup: TRADE_MENU
          });
          break;

        default:
          // Let other handlers process their respective callbacks
          return;
      }
    } catch (error) {
      console.error('Error in handleCallback:', error);
      await this.handleError(ctx, error);
    }
  }

  private async handleSpotTrading(ctx: Context, action: string): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 New Order', callback_data: 'new_spot_order' }],
        [{ text: '📜 Open Orders', callback_data: 'view_spot_orders' }],
        [{ text: '🔙 Back to Trading', callback_data: 'back_to_trading' }]
      ]
    };

    switch (action) {
      case 'spot_trading':
        await this.editMessage(ctx, '*📊 Spot Trading*\n\nConfigure your spot trading parameters:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;

      case 'new_spot_order':
        // Handle new spot order logic
        await this.editMessage(ctx, '*🔄 New Spot Order*\n\nSelect token pair and enter amount:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;

      case 'view_spot_orders':
        // Handle view spot orders logic
        await this.editMessage(ctx, '*📜 Open Orders*\n\nYour active spot orders:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;
    }
  }

  private async handleLeverageTrading(ctx: Context, action: string): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 New Position', callback_data: 'new_leverage_position' }],
        [{ text: '📜 Open Positions', callback_data: 'view_leverage_positions' }],
        [{ text: '🔙 Back to Trading', callback_data: 'back_to_trading' }]
      ]
    };

    switch (action) {
      case 'leverage_trading':
        await this.editMessage(ctx, '*📈 Leverage Trading*\n\nConfigure your leverage trading settings:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;

      case 'new_leverage_position':
        // Handle new leverage position logic
        await this.editMessage(ctx, '*🔄 New Leverage Position*\n\nSelect token and leverage:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;

      case 'view_leverage_positions':
        // Handle view leverage positions logic
        await this.editMessage(ctx, '*📜 Open Positions*\n\nYour active leverage positions:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;
    }
  }

  private async handleLiquidityPool(ctx: Context, action: string): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [{ text: '➕ Add Liquidity', callback_data: 'add_liquidity' }],
        [{ text: '➖ Remove Liquidity', callback_data: 'remove_liquidity' }],
        [{ text: '🔙 Back to Trading', callback_data: 'back_to_trading' }]
      ]
    };

    switch (action) {
      case 'liquidity_pool':
        await this.editMessage(ctx, '*💧 Liquidity Pool*\n\nManage your liquidity pool positions:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;

      case 'add_liquidity':
        // Handle add liquidity logic
        await this.editMessage(ctx, '*➕ Add Liquidity*\n\nSelect token pair and amount:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;

      case 'remove_liquidity':
        // Handle remove liquidity logic
        await this.editMessage(ctx, '*➖ Remove Liquidity*\n\nSelect pool to withdraw from:', {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        break;
    }
  }
}
