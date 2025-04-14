import { Context } from 'telegraf';
import { Telegraf } from 'telegraf';
import TelegramBot from 'node-telegram-bot-api';
import { BaseCommand } from './base-command';
import { ChatType } from '../types/chat-types';
import { TokenScanner } from '../../services/scanner/token-scanner';
import { UserPreferences } from '../../services/user/user-preferences';
import { ChatManager } from '../../services/chat/chat-manager';
import { Update } from 'telegraf/typings/core/types/typegram';

interface ChatConfig {
  chatId: number;
  type: ChatType;
  threadId?: number;
  features: {
    scanner?: boolean;
  };
  adminIds: number[];
}

export class ScannerCommand extends BaseCommand {
  readonly name = 'scanner';
  readonly description = 'Configure and manage token scanner settings';

  constructor(
    bot: Telegraf<Context<Update>> | TelegramBot,
    private tokenScanner: TokenScanner,
    private userPrefs: UserPreferences,
    private chatManager: ChatManager
  ) {
    super(bot);
  }

  async execute(ctx: Context<Update>): Promise<void> {
    try {
      const chatId = this.getChatId(ctx);
      const userId = this.getUserId(ctx);
      
      if (!chatId || !userId) {
        await this.handleError(ctx, new Error('Missing chat or user context'));
        return;
      }

      const chatType = ctx.chat?.type as ChatType;
      const messageThreadId = ctx.chat && 'message_thread_id' in ctx.chat ? ctx.chat.message_thread_id : undefined;

      const config = await this.chatManager.getChatConfig(chatId);
      if (!config) {
        await this.createNewChat(ctx, chatId, chatType, userId, messageThreadId as number | undefined);
        return;
      }

      if (!config.adminIds.includes(userId)) {
        await this.editMessage(ctx, '❌ Only chat administrators can configure the scanner');
        return;
      }

      await this.showScannerMenu(ctx, config);
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const data = ctx.callbackQuery.data;
      const chatId = this.getChatId(ctx);
      const userId = this.getUserId(ctx);

      if (!chatId || !userId) {
        await this.handleError(ctx, new Error('Missing chat or user context'));
        return;
      }

      const config = await this.chatManager.getChatConfig(chatId);
      if (!config || !config.adminIds.includes(userId)) {
        await this.editMessage(ctx, '❌ Only chat administrators can configure the scanner');
        return;
      }

      const [action, value] = data.split(':');
      await this.handleScannerAction(ctx, action, value, config);
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private async createNewChat(
    ctx: Context<Update>,
    chatId: number,
    chatType: ChatType,
    userId: number,
    threadId?: number
  ): Promise<void> {
    const config: ChatConfig = {
      chatId,
      type: chatType,
      threadId,
      features: {
        scanner: false
      },
      adminIds: [userId]
    };

    await this.chatManager.registerChat(config);
    await this.showScannerMenu(ctx, config);
  }

  private async showScannerMenu(ctx: Context<Update>, config: ChatConfig): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [{
          text: `Scanner: ${config.features.scanner ? '✅' : '❌'}`,
          callback_data: `toggle_scanner:${!config.features.scanner}`
        }],
        [{
          text: '⚙️ Configure Filters',
          callback_data: 'configure_filters'
        }],
        [{
          text: '📊 View Statistics',
          callback_data: 'view_stats'
        }],
        [{
          text: '🔙 Back',
          callback_data: 'back_to_main'
        }]
      ]
    };

    await this.editMessage(ctx,
      '*🔍 Token Scanner Settings*\n\n' +
      'Configure scanner settings for this chat:\n\n' +
      `*Status:* ${config.features.scanner ? '✅ Active' : '❌ Inactive'}\n` +
      `*Chat Type:* ${config.type}\n` +
      `*Admins:* ${config.adminIds.length}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async handleScannerAction(
    ctx: Context<Update>,
    action: string,
    value: string,
    config: ChatConfig
  ): Promise<void> {
    switch (action) {
      case 'toggle_scanner':
        config.features.scanner = value === 'true';
        await this.chatManager.registerChat(config);
        await this.showScannerMenu(ctx, config);
        break;

      case 'configure_filters':
        await this.showFilterMenu(ctx, config);
        break;

      case 'view_stats':
        await this.showScannerStats(ctx, config);
        break;
      case 'back_to_main':
        await this.editMessage(ctx,
          '*⚙️ User Settings*\n\n' +
          'Configure your bot preferences:\n\n' +
          '*Scanner:* ' + (config.features.scanner ? '✅ Active' : '❌ Inactive') + '\n' +
          '*Notifications:* Set alert preferences\n' +
          '*Trading:* Configure trading parameters',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{
                  text: `🔍 Scanner: ${config.features.scanner ? '✅ Active' : '❌ Inactive'}`,
                  callback_data: `toggle_scanner:${!config.features.scanner}`
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
            }
          }
        );
        break;
    }
  }

  private async showFilterMenu(ctx: Context<Update>, config: ChatConfig): Promise<void> {
    const filters = await this.tokenScanner.getScannerFilters(config.chatId);
    const keyboard = {
      inline_keyboard: [
        [{
          text: `Min Liquidity: $${filters.minLiquidity.toLocaleString()}`,
          callback_data: 'set_min_liquidity'
        }],
        [{
          text: `Min Market Cap: $${filters.minMarketCap.toLocaleString()}`,
          callback_data: 'set_min_mcap'
        }],
        [{
          text: '🔙 Back',
          callback_data: 'back_to_menu'
        }]
      ]
    };

    await this.editMessage(ctx,
      '*⚙️ Scanner Filters*\n\n' +
      'Configure minimum requirements for token alerts:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async showScannerStats(ctx: Context<Update>, config: ChatConfig): Promise<void> {
    const stats = await this.tokenScanner.getStats(config.chatId);
    await this.editMessage(ctx,
      '*📊 Scanner Statistics*\n\n' +
      `*Total Scans:* ${stats.totalScans}\n` +
      `*Tokens Found:* ${stats.tokensFound}\n` +
      `*Alerts Sent:* ${stats.alertsSent}\n` +
      `*Last Scan:* ${stats.lastScan ? new Date(stats.lastScan).toLocaleString() : 'Never'}`,
      {
        parse_mode: 'Markdown'
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
