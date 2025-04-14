import { Context, Telegraf } from 'telegraf';
import { CallbackQuery, Message } from 'telegraf/types';
import { Command } from '../types';
import { ChatType } from '../types/chat-types';
import { TokenScanner } from '../../services/scanner/token-scanner';
import { UserPreferences } from '../../services/user/user-preferences';
import { ChatManager } from '../../services/chat/chat-manager';

interface ChatConfig {
  chatId: number;
  type: ChatType;
  threadId?: number;
  features: {
    scanner?: boolean;
  };
  adminIds: number[];
}

interface ScannerCallbackQuery extends CallbackQuery.DataQuery {
  message: Message.TextMessage;
}

export class ScannerCommand implements Command {
  private tokenScanner: TokenScanner;
  private userPrefs: UserPreferences;
  private chatManager: ChatManager;

  constructor(
    tokenScanner: TokenScanner,
    userPrefs: UserPreferences,
    chatManager: ChatManager
  ) {
    this.tokenScanner = tokenScanner;
    this.userPrefs = userPrefs;
    this.chatManager = chatManager;
  }

  async execute(ctx: Context, bot: Telegraf): Promise<void> {
    if (!ctx.chat) {
      console.error('Chat context is undefined');
      return;
    }
    if (!ctx.from) {
      console.error('From context is undefined');
      return;
    }

    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const chatType = ctx.chat.type as ChatType;
    const messageThreadId = 'message_thread_id' in ctx.chat && ctx.chat.message_thread_id 
      ? Number(ctx.chat.message_thread_id) 
      : undefined;

    try {
      // Check if user is admin in group/channel
      if (chatType !== 'private') {
        const isAdmin = await this.chatManager.isAdmin(chatId, userId);
        if (!isAdmin) {
          await ctx.telegram.sendMessage(
            chatId,
            '⚠️ Only chat administrators can manage scanner settings',
            { message_thread_id: messageThreadId }
          );
          return;
        }
      }

      const chatConfig = await this.chatManager.getChatConfig(chatId);
      const isActive = chatConfig?.features?.scanner || false;

      const keyboard = {
        inline_keyboard: [
          [{ text: isActive ? '🔴 Disable Scanner' : '🟢 Enable Scanner', 
             callback_data: isActive ? 'scanner_disable' : 'scanner_enable' }],
          [{ text: '⚙️ Scanner Settings', callback_data: 'scanner_settings' }],
          [{ text: '📊 View Status', callback_data: 'scanner_status' }],
          chatType === 'private' ? 
            [{ text: '🔙 Back', callback_data: 'back_to_main' }] : 
            [{ text: '🔗 Set Thread', callback_data: 'scanner_set_thread' }]
        ]
      };

      const statusMessage = this.getStatusMessage(chatConfig);

      await ctx.telegram.sendMessage(
        chatId,
        statusMessage,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
          message_thread_id: messageThreadId
        }
      );
    } catch (error) {
      console.error('Error in scanner command:', error);
      await ctx.telegram.sendMessage(
        chatId,
        '❌ Sorry, there was an error processing your request. Please try again later.'
      );
    }
  }

  async handleCallback(ctx: Context, bot: Telegraf): Promise<void> {
    const callbackQuery = ctx.callbackQuery as ScannerCallbackQuery;
    if (!callbackQuery || !callbackQuery.data) return;
    
    if (!ctx.from) {
      console.error('From context is undefined');
      return;
    }
    if (!ctx.chat) {
      console.error('Chat context is undefined');
      return;
    }

    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const messageThreadId = 'message_thread_id' in ctx.chat && ctx.chat.message_thread_id 
      ? Number(ctx.chat.message_thread_id) 
      : undefined;

    try {
      // Verify admin status for group/channel actions
      if (ctx.chat.type !== 'private') {
        const isAdmin = await this.chatManager.isAdmin(chatId, userId);
        if (!isAdmin) {
          await ctx.telegram.answerCbQuery(callbackQuery.id, '⚠️ Only administrators can change scanner settings', {
            show_alert: true
          });
          return;
        }
      }

      switch (callbackQuery.data) {
        case 'scanner_enable':
          await this.enableScanner(chatId, messageThreadId, ctx);
          break;
        case 'scanner_disable':
          await this.disableScanner(chatId, messageThreadId, ctx);
          break;
        case 'scanner_settings':
          await this.showSettings(chatId, messageThreadId, ctx);
          break;
        case 'scanner_set_thread':
          await this.setThread(chatId, messageThreadId, ctx);
          break;
        default:
          await ctx.telegram.answerCbQuery(callbackQuery.id);
      }
    } catch (error) {
      console.error('Error handling scanner callback:', error);
      await ctx.telegram.answerCbQuery(callbackQuery.id, '❌ Error processing request', {
        show_alert: true,
      });
    }
  }

  private getStatusMessage(chatConfig: ChatConfig | null): string {
    return '*🔍 Token Scanner*\n\n' +
      'Monitor new tokens and track their performance.\n\n' +
      '• Get instant notifications for new tokens\n' +
      '• Track price movements and liquidity\n' +
      '• Set custom alerts and filters';
  }

  private async enableScanner(chatId: number, messageThreadId: number | undefined, ctx: Context): Promise<void> {
    const config: ChatConfig = {
      chatId,
      type: ctx.chat?.type as ChatType || 'private',
      threadId: messageThreadId,
      features: {
        scanner: true
      },
      adminIds: []
    };

    await this.chatManager.registerChat(config);
    
    await ctx.telegram.sendMessage(
      chatId,
      '🟢 *Scanner Enabled*\n\n' +
      'Scanner alerts will be sent to ' +
      (messageThreadId ? `thread #${messageThreadId}` : 'this chat') +
      '\n\nUse /settings to configure preferences',
      {
        parse_mode: 'Markdown',
        message_thread_id: messageThreadId
      }
    );
  }

  private async disableScanner(chatId: number, messageThreadId: number | undefined, ctx: Context): Promise<void> {
    await this.chatManager.updateChatConfig(chatId, {
      features: { scanner: false }
    });

    await ctx.telegram.sendMessage(
      chatId,
      '🔴 Scanner Disabled\n\n' +
      'No more scanner alerts will be sent to this chat',
      {
        parse_mode: 'Markdown',
        message_thread_id: messageThreadId
      }
    );
  }

  private async showSettings(chatId: number, messageThreadId: number | undefined, ctx: Context): Promise<void> {
    // Implementation
  }

  private async setThread(chatId: number, messageThreadId: number | undefined, ctx: Context): Promise<void> {
    await ctx.telegram.sendMessage(
      chatId,
      '📌 To set a thread for scanner alerts:\n\n' +
      '1. Go to your desired thread\n' +
      '2. Type /setthread in that thread\n\n' +
      'All scanner alerts will be sent to that thread',
      {
        parse_mode: 'Markdown',
        message_thread_id: messageThreadId
      }
    );
  }

  async sendAlert(chatConfig: ChatConfig, type: string, data: any, bot: Telegraf): Promise<void> {
    if (!chatConfig.features.scanner) return;

    const message = this.formatAlert(type, data);
    if (message) {
      await bot.telegram.sendMessage(chatConfig.chatId, message, {
        parse_mode: 'Markdown',
        message_thread_id: chatConfig.threadId,
        disable_web_preview: true
      });
    }
  }

  private formatAlert(type: string, data: { reasons: string[] }): string {
    switch (type) {
      case 'opportunity':
        return this.formatOpportunityAlert(data);
      case 'trade':
        return this.formatTradeAlert(data);
      case 'risk':
        return `⚠️ *Risk Alert*\n\n` +
           `*Analysis:*\n${data.reasons.map((reason: string) => `• ${reason}`).join('\n')}`;
      default:
        return '';
    }
  }

  private formatOpportunityAlert(data: { symbol: string; score: number; liquidity: number; volume: number; holders: number; reasons: string[] }): string {
    return `🎯 *New Token Opportunity*\n\n` +
           `Token: ${data.symbol}\n` +
           `Score: ${data.score}/100\n\n` +
           `💰 Liquidity: $${data.liquidity.toLocaleString()}\n` +
           `📊 24h Volume: $${data.volume.toLocaleString()}\n` +
           `👥 Holders: ${data.holders}\n\n` +
           `*Analysis:*\n${data.reasons.map((reason: string) => `• ${reason}`).join('\n')}`;
  }

  private formatTradeAlert(data: any): string {
    const emoji = data.action === 'BUY' ? '🟢' : '🔴';
    return `${emoji} *${data.action} Alert*\n\n` +
           `Token: ${data.symbol}\n` +
           `Price: $${data.price.toFixed(6)}\n` +
           `Amount: ${data.amount}\n` +
           `Reason: ${data.reason}`;
  }
}
