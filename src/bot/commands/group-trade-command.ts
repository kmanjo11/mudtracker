import { Telegraf, Context } from 'telegraf';
import { GroupTradingService } from '../../services/trading/group-trading-service';
import { ExitType, GroupTradeSettings } from '../../types/group-trading-types';
import { Message, CallbackQuery, InlineKeyboardMarkup, Update } from 'telegraf/typings/core/types/typegram';
import { PhantomService } from '../../services/wallet/phantom-service';
import { Redis } from 'ioredis';
import { Command } from '../types';

interface TradeAction {
  type: 'create' | 'join' | 'vote' | 'settings';
  tradeId?: string;
  value?: string;
}

export class GroupTradeCommand implements Command {
  readonly name = 'grouptrade';
  readonly description = 'Create and manage group trades';
  private redis: Redis;
  private phantomService: PhantomService;

  constructor(
    private bot: Telegraf,
    private groupTradingService: GroupTradingService
  ) {
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;
    
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: redisPort,
      password: process.env.REDIS_PASSWORD
    });

    this.phantomService = new PhantomService(this.groupTradingService.getConnection());
  }

  async execute(ctx: Context<Update>): Promise<void> {
    if (!ctx.chat || ctx.chat.type === 'private') {
      await ctx.reply('This command is only available in groups and channels');
      return;
    }
    await this.handleGroupTradeCommand(ctx);
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const query = ctx.callbackQuery as Extract<CallbackQuery, { data: string }>;
    const data = query.data;
    const [prefix, action, ...params] = data.split(':');

    if (prefix !== 'trade') return;

    const tradeAction: TradeAction = {
      type: action as TradeAction['type'],
      tradeId: params[0],
      value: params[1]
    };

    switch (tradeAction.type) {
      case 'create':
        await this.handleCreateTrade(ctx);
        break;
      case 'join':
        await this.handleJoinTrade(ctx);
        break;
      case 'vote':
        await this.handleVote(ctx);
        break;
      case 'settings':
        await this.handleSettings(ctx);
        break;
    }
  }

  private async handleGroupTradeCommand(ctx: Context<Update>): Promise<void> {
    if (!ctx.chat || !ctx.from) return;

    const isAdmin = await this.isGroupAdmin(ctx);
    if (!isAdmin) {
      await ctx.reply('Only group administrators can create group trades');
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '➕ Create Trade', callback_data: 'trade:create' }],
        [{ text: '⚙️ Settings', callback_data: 'trade:settings' }]
      ]
    } as InlineKeyboardMarkup;

    await ctx.reply(
      '*🤝 Group Trading*\n\n' +
      'Create and manage group trades:\n\n' +
      '• Set entry and exit conditions\n' +
      '• Invite members to join\n' +
      '• Vote on trade decisions\n' +
      '• View group performance',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async handleCreateTrade(ctx: Context<Update>): Promise<void> {
    if (!ctx.chat?.id || !ctx.from?.id) return;

    const settings = await this.getTradeSettings(ctx.chat.id);
    if (!settings) {
      await ctx.reply('Please configure trade settings first');
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '🎯 Set Target', callback_data: 'trade:settings:target' }],
        [{ text: '⛔ Set Stop Loss', callback_data: 'trade:settings:stop' }],
        [{ text: '✅ Confirm', callback_data: 'trade:create:confirm' }],
        [{ text: '❌ Cancel', callback_data: 'trade:create:cancel' }]
      ]
    } as InlineKeyboardMarkup;

    await ctx.reply(
      '*Create Group Trade*\n\n' +
      'Configure trade parameters:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async handleJoinTrade(ctx: Context<Update>): Promise<void> {
    if (!ctx.chat?.id || !ctx.from?.id || !ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const tradeId = ctx.callbackQuery.data.split(':')[2];
    if (!tradeId) return;

    try {
      const walletAddress = await this.phantomService.getWalletAddress(ctx.from.id);
      if (!walletAddress) {
        await ctx.reply('Please connect your wallet first');
        return;
      }

      const settings = await this.getTradeSettings(ctx.chat.id);
      const amount = settings?.defaultMinEntry || 0.1; // Default to 0.1 SOL if no settings

      await this.groupTradingService.joinTrade(tradeId, ctx.from.id.toString(), walletAddress, amount);
      await ctx.reply('Successfully joined the trade!');
    } catch (error) {
      await ctx.reply('Failed to join trade. Please try again.');
    }
  }

  private async handleVote(ctx: Context<Update>): Promise<void> {
    if (!ctx.chat?.id || !ctx.from?.id || !ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const [, , tradeId, vote] = ctx.callbackQuery.data.split(':');
    if (!tradeId || !vote) return;

    try {
      const trade = await this.groupTradingService.getTrade(tradeId);
      if (!trade) {
        await ctx.reply('Trade not found');
        return;
      }

      await this.groupTradingService.initiateExit(tradeId, ctx.from.id.toString());
      await ctx.reply(`Vote recorded: ${vote === 'yes' ? '✅' : '❌'}`);
    } catch (error) {
      await ctx.reply('Failed to record vote. Please try again.');
    }
  }

  private async handleSettings(ctx: Context<Update>): Promise<void> {
    if (!ctx.chat?.id) return;

    const keyboard = {
      inline_keyboard: [
        [{ text: '👥 Min. Participants', callback_data: 'trade:settings:min_participants' }],
        [{ text: '🎯 Default Targets', callback_data: 'trade:settings:targets' }],
        [{ text: '⏱️ Vote Duration', callback_data: 'trade:settings:duration' }],
        [{ text: '⬅️ Back', callback_data: 'trade:main' }]
      ]
    } as InlineKeyboardMarkup;

    await ctx.reply(
      '*Group Trade Settings*\n\n' +
      'Configure trade parameters:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async isGroupAdmin(ctx: Context<Update>): Promise<boolean> {
    if (!ctx.chat?.id || !ctx.from?.id) return false;

    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
      return ['creator', 'administrator'].includes(member.status);
    } catch {
      return false;
    }
  }

  private async getTradeSettings(chatId: number): Promise<GroupTradeSettings | null> {
    const settings = await this.redis.get(`trade_settings:${chatId}`);
    return settings ? JSON.parse(settings) : null;
  }
}
