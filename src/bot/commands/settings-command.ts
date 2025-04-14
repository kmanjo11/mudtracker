import { Context, Telegraf } from 'telegraf';
import TelegramBot from 'node-telegram-bot-api';
import { BaseCommand } from './base-command';
import { UserSettingsMessages } from '../messages/user-settings-messages';
import { SUB_MENU, TRADE_MENU } from '../../config/bot-menus';
import { PrismaUserRepository } from '../../repositories/prisma/user';
import { UserSettingsService } from '../../services/user/user-settings-service';
import { Update } from 'telegraf/typings/core/types/typegram';
import { createInlineKeyboard } from '../utils/keyboard';
import { ChatManager } from '../../services/chat/chat-manager';

interface BotStatus {
  botStatus: 'ACTIVE' | 'INACTIVE';
}

export class SettingsCommand extends BaseCommand {
  readonly name = 'settings';
  readonly description = 'Configure user settings and preferences';

  private userSettingsMessages: UserSettingsMessages;
  private prismaUserRepository: PrismaUserRepository;

  constructor(
    bot: Telegraf<Context<Update>> | TelegramBot,
    private userSettings: UserSettingsService,
    private chatManager: ChatManager
  ) {
    super(bot);
    this.userSettingsMessages = new UserSettingsMessages();
    this.prismaUserRepository = new PrismaUserRepository();
  }

  private async triggerScanner(ctx: Context<Update>, userId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    await this.userSettings.updateBotStatus(userId, status);
    
    // Sync bot status with chat configuration
    const chatId = this.getChatId(ctx);
    if (chatId) {
      const config = await this.chatManager.getChatConfig(chatId) || {
        chatId,
        type: 'private',
        features: { scanner: false },
        adminIds: [Number(userId)]
      };
      
      // Update chat features based on bot status
      if (status === 'INACTIVE') {
        config.features.scanner = false;
      }
      
      await this.chatManager.registerChat(config);
    }
    
    await this.showMainMenu(ctx, status);
  }

  async execute(ctx: Context<Update>): Promise<void> {
    try {
      const userId = this.getUserId(ctx);
      if (!userId) {
        await this.handleError(ctx, new Error('User ID not found'));
        return;
      }

      const settings = await this.userSettings.getUserSettings(ctx);
      await this.showMainMenu(ctx, settings?.botStatus || 'ACTIVE');
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const userId = this.getUserId(ctx);
      if (!userId) {
        await this.handleError(ctx, new Error('User ID not found'));
        return;
      }

      const data = ctx.callbackQuery.data;
      await this.handleSettingsAction(ctx, userId.toString(), data);
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private async showMainMenu(ctx: Context<Update>, botStatus: string): Promise<void> {
    const chatId = this.getChatId(ctx);
    const config = chatId ? await this.chatManager.getChatConfig(chatId) : null;
    const scannerStatus = config?.features?.scanner || false;

    const keyboard = {
      inline_keyboard: [
        [{
          text: `🔍 Scanner: ${scannerStatus ? '✅ Active' : '❌ Inactive'}`,
          callback_data: `toggle_scanner:${!scannerStatus}`
        }],
        [{
          text: '🔔 Notification Settings',
          callback_data: 'notification_settings'
        }],
        [{
          text: '💰 Trading Settings',
          callback_data: 'trading_settings'
        }],
        [{
          text: '🔙 Back',
          callback_data: 'back_to_main'
        }]
      ]
    };

    await this.editMessage(ctx,
      '*⚙️ User Settings*\n\n' +
      'Configure your bot preferences:\n\n' +
      `*Scanner:* ${scannerStatus ? '✅ Active' : '❌ Inactive'}\n` +
      '*Notifications:* Set alert preferences\n' +
      '*Trading:* Configure trading parameters',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async handleSettingsAction(ctx: Context<Update>, userId: string, action: string): Promise<void> {
    const [command, value] = action.split(':');
    const chatId = this.getChatId(ctx);

    switch (command) {
      case 'toggle_scanner':
        if (chatId) {
          const config = await this.chatManager.getChatConfig(chatId) || {
            chatId,
            type: 'private',
            features: { scanner: false },
            adminIds: [Number(userId)]
          };
          config.features.scanner = value === 'true';
          await this.chatManager.registerChat(config);
          await this.showMainMenu(ctx, 'ACTIVE');
        }
        break;

      case 'notification_settings':
        await this.showNotificationSettings(ctx, userId);
        break;

      case 'trading_settings':
        await this.showTradingSettings(ctx, userId);
        break;

      case 'back_to_main':
        await this.showMainMenu(ctx, 'ACTIVE');
        break;
    }
  }

  private async showNotificationSettings(ctx: Context<Update>, userId: string): Promise<void> {
    const settings = await this.userSettings.getNotificationSettings(userId);
    
    const keyboard = {
      inline_keyboard: [
        [{
          text: `Price Alerts: ${settings.priceAlerts ? '✅' : '❌'}`,
          callback_data: 'toggle_price_alerts'
        }],
        [{
          text: `Trade Notifications: ${settings.tradeNotifications ? '✅' : '❌'}`,
          callback_data: 'toggle_trade_notifications'
        }],
        [{
          text: '🔙 Back',
          callback_data: 'back_to_main'
        }]
      ]
    };

    await this.editMessage(ctx,
      '*🔔 Notification Settings*\n\n' +
      'Configure your notification preferences:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async showTradingSettings(ctx: Context<Update>, userId: string): Promise<void> {
    const settings = await this.userSettings.getTradingSettings(userId);
    
    const keyboard = {
      inline_keyboard: [
        [{
          text: `Max Slippage: ${settings.maxSlippage}%`,
          callback_data: 'set_max_slippage'
        }],
        [{
          text: `Auto-compound: ${settings.autoCompound ? '✅' : '❌'}`,
          callback_data: 'toggle_auto_compound'
        }],
        [{
          text: '🔙 Back',
          callback_data: 'back_to_main'
        }]
      ]
    };

    await this.editMessage(ctx,
      '*💰 Trading Settings*\n\n' +
      'Configure your trading parameters:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  protected getChatId(ctx: Context<Update>): number | undefined {
    if ('message' in ctx.update) {
      return ctx.update.message.chat.id;
    } else if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
      return ctx.update.callback_query.message.chat.id;
    }
    return undefined;
  }

  protected getUserId(ctx: Context<Update>): number | undefined {
    if ('message' in ctx.update) {
      return ctx.update.message.from?.id;
    } else if ('callback_query' in ctx.update) {
      return ctx.update.callback_query.from.id;
    }
    return undefined;
  }
}
