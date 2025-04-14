import { Context, Telegraf } from 'telegraf';
import TelegramBot from 'node-telegram-bot-api';
import { BaseCommand } from './base-command';
import { TradingService } from '../../services/trading/trading-service';
import { Update } from 'telegraf/typings/core/types/typegram';
import { Command } from '../types';

interface TradeStats {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  profitLoss: number;
  lastUpdated: Date;
}

interface TradeSettings {
  maxTradeSize: number;
  maxSlippage: number;
  autoCompound: boolean;
}

interface SmartTradeConfig {
  enabled: boolean;
  strategy?: string;
  riskLevel?: string;
}

interface Trade {
  type: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  amount: number;
  status: string;
}

export class TradeCommand extends BaseCommand implements Command {
  readonly name = 'trade';
  readonly description = 'Execute trades and manage trading settings';

  private readonly DEFAULT_STATS: TradeStats = {
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalVolume: 0,
    profitLoss: 0,
    lastUpdated: new Date()
  };

  constructor(
    bot: Telegraf<Context<Update>> | TelegramBot,
    private tradingService: TradingService
  ) {
    super(bot);
  }

  async execute(ctx: Context<Update>, args: string[] = []): Promise<void> {
    try {
      if (!ctx.chat || ctx.chat.type !== 'private') {
        await ctx.reply('❌ Trading is only available in private chats');
        return;
      }

      const userId = this.getUserId(ctx);
      if (!userId) {
        await this.handleError(ctx, new Error('User ID not found'));
        return;
      }

      await this.showTradingDashboard(ctx, userId.toString());
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
        await this.handleError(ctx, new Error('Invalid callback query'));
        return;
      }

      const userId = this.getUserId(ctx);
      if (!userId) {
        await this.handleError(ctx, new Error('User ID not found'));
        return;
      }

      const data = ctx.callbackQuery.data;
      const [command, action, ...params] = data.split(':');
      
      if (command === 'trade') {
        await this.handleTradeAction(ctx, userId.toString(), action || 'trade', params);
      } else if (command === 'quick_trade') {
        await this.handleQuickTrade(ctx, userId.toString(), action as 'buy' | 'sell');
      } else if (command === 'smart_trade') {
        await this.handleSmartTradeAction(ctx, userId.toString(), action);
      } else if (command === 'trade_settings') {
        await this.handleTradeSettings(ctx, userId.toString(), action);
      } else {
        await this.handleError(ctx, new Error('Invalid trade command'));
      }
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private async handleTradeAction(ctx: Context<Update>, userId: string, action: string, params: string[] = []): Promise<void> {
    try {
      switch (action) {
        case 'trade':
          await this.showTradingDashboard(ctx, userId);
          break;

        case 'quick':
          await this.showQuickTradeMenu(ctx, userId);
          break;

        case 'smart':
          await this.showSmartTradeMenu(ctx, userId);
          break;

        case 'history':
          await this.showTradeHistory(ctx, userId);
          break;

        case 'settings':
          await this.showTradeSettings(ctx, userId);
          break;

        case 'back':
          await this.showTradingDashboard(ctx, userId);
          break;

        case 'buy':
        case 'sell':
          await this.handleQuickTrade(ctx, userId, action);
          break;

        default:
          await this.handleError(ctx, new Error('Invalid trade action'));
      }
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private async handleQuickTrade(ctx: Context<Update>, userId: string, type: 'buy' | 'sell'): Promise<void> {
    // Implement quick trade logic here
    await ctx.reply(`${type.toUpperCase()} order processing...`);
  }

  private async showTradingDashboard(ctx: Context<Update>, userId: string): Promise<void> {
    const stats = await this.tradingService.getUserStats(userId) || this.DEFAULT_STATS;
    const smartTradeStatus = await this.getSmartTradeStatus(userId);
    
    const keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } = {
      inline_keyboard: [
        [{
          text: '🎯 Quick Trade',
          callback_data: 'trade:quick'
        }],
        [{
          text: `🤖 Smart Trade ${smartTradeStatus ? '✅' : '❌'}`,
          callback_data: 'trade:smart'
        }],
        [{
          text: '📊 Trade History',
          callback_data: 'trade:history'
        }],
        [{
          text: '⚙️ Settings',
          callback_data: 'trade:settings'
        }]
      ]
    };

    await this.editMessage(ctx,
      '*🔄 Trading Dashboard*\n\n' +
      `*💰 Total P&L:* ${this.formatPnL(stats.profitLoss)}\n` +
      `*📈 Total Volume:* ${this.formatAmount(stats.totalVolume)} SOL\n` +
      `*📊 Win Rate:* ${this.calculateWinRate(stats)}%\n` +
      `*🤖 Smart Trade:* ${smartTradeStatus ? 'Active' : 'Inactive'}\n\n` +
      'Select your trading method:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async showQuickTradeMenu(ctx: Context<Update>, userId: string): Promise<void> {
    const keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } = {
      inline_keyboard: [
        [{
          text: '📈 Market Buy',
          callback_data: 'quick_trade:buy'
        }],
        [{
          text: '📉 Market Sell',
          callback_data: 'quick_trade:sell'
        }],
        [{
          text: '🔙 Back',
          callback_data: 'trade:back'
        }]
      ]
    };

    await this.editMessage(ctx,
      '*🎯 Quick Trade*\n\n' +
      'Execute instant market orders:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async showSmartTradeMenu(ctx: Context<Update>, userId: string): Promise<void> {
    const config = await this.tradingService.getSmartTradeConfig(userId) || { enabled: false };
    
    const keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } = {
      inline_keyboard: [
        [{
          text: `Auto-Trading: ${config.enabled ? '✅' : '❌'}`,
          callback_data: 'smart_trade:toggle'
        }],
        [{
          text: '🔙 Back',
          callback_data: 'trade:back'
        }]
      ]
    };

    await this.editMessage(ctx,
      '*🤖 Smart Trade*\n\n' +
      'Configure automated trading:\n\n' +
      `*Status:* ${config.enabled ? '✅ Active' : '❌ Inactive'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async showTradeHistory(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      const trades = await this.tradingService.getRecentTrades(userId);
      
      let message = '*📜 Trade History*\n\n';
      
      if (trades.length === 0) {
        message += 'No recent trades found.';
      } else {
        trades.forEach((trade, index) => {
          message += `${index + 1}. ${trade.type} ${trade.amount} ${trade.symbol}\n`;
          message += `   💰 Price: ${trade.price}\n`;
          message += `   📊 Status: ${trade.status}\n\n`;
        });
      }

      const keyboard = {
        inline_keyboard: [
          [{
            text: '🔙 Back',
            callback_data: 'trade:back'
          }]
        ]
      };

      await this.editMessage(ctx, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private async showTradeSettings(ctx: Context<Update>, userId: string): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [{ text: '⚠️ Risk Level', callback_data: 'trade_settings:risk' }],
        [{ text: '📊 Slippage', callback_data: 'trade_settings:slippage' }],
        [{ text: '⚡ Auto-Trading', callback_data: 'trade_settings:auto' }],
        [{ text: '🔙 Back', callback_data: 'trade:back' }]
      ]
    };

    await this.editMessage(ctx,
      '*⚙️ Trading Settings*\n\n' +
      'Configure your trading parameters:\n\n' +
      '• Risk Management\n' +
      '• Slippage Tolerance\n' +
      '• Automated Trading',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  private async handleTradeSettings(ctx: Context<Update>, userId: string, action: string): Promise<void> {
    try {
      switch (action) {
        case 'risk':
          await this.editMessage(ctx,
            '*⚠️ Risk Level Settings*\n\n' +
            'Select your preferred risk level:\n\n' +
            '• Low: Conservative strategy\n' +
            '• Medium: Balanced approach\n' +
            '• High: Aggressive trading',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🟢 Low Risk', callback_data: 'trade_settings:set_risk:low' }],
                  [{ text: '🟡 Medium Risk', callback_data: 'trade_settings:set_risk:medium' }],
                  [{ text: '🔴 High Risk', callback_data: 'trade_settings:set_risk:high' }],
                  [{ text: '🔙 Back', callback_data: 'trade:settings' }]
                ]
              }
            }
          );
          break;

        case 'slippage':
          await this.editMessage(ctx,
            '*📊 Slippage Tolerance*\n\n' +
            'Select maximum allowed slippage:\n\n' +
            '• 0.1%: Minimal price impact\n' +
            '• 0.5%: Standard tolerance\n' +
            '• 1.0%: Higher tolerance',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '0.1%', callback_data: 'trade_settings:set_slippage:0.1' }],
                  [{ text: '0.5%', callback_data: 'trade_settings:set_slippage:0.5' }],
                  [{ text: '1.0%', callback_data: 'trade_settings:set_slippage:1.0' }],
                  [{ text: '🔙 Back', callback_data: 'trade:settings' }]
                ]
              }
            }
          );
          break;

        case 'auto':
          await this.editMessage(ctx,
            '*⚡ Auto-Trading Settings*\n\n' +
            'Configure automated trading parameters:\n\n' +
            '• Enable/disable auto-trading\n' +
            '• Set maximum trade size\n' +
            '• Configure trading pairs',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🤖 Toggle Auto-Trading', callback_data: 'trade_settings:toggle_auto' }],
                  [{ text: '💰 Max Trade Size', callback_data: 'trade_settings:max_trade' }],
                  [{ text: '⚡ Trading Pairs', callback_data: 'trade_settings:pairs' }],
                  [{ text: '🔙 Back', callback_data: 'trade:settings' }]
                ]
              }
            }
          );
          break;

        case 'set_risk':
        case 'set_slippage':
        case 'toggle_auto':
        case 'max_trade':
        case 'pairs':
          // These cases would be handled by extending the trading service
          // For now, we'll show a message that these features are coming soon
          await this.editMessage(ctx,
            '*🔄 Setting Update*\n\n' +
            'This feature will be available soon!',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 Back', callback_data: 'trade:settings' }]
                ]
              }
            }
          );
          break;

        default:
          await this.showTradeSettings(ctx, userId);
          break;
      }
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private async getSmartTradeStatus(userId: string): Promise<boolean> {
    const config = await this.tradingService.getSmartTradeConfig(userId);
    return config.enabled;
  }

  private async handleSmartTradeAction(ctx: Context<Update>, userId: string, action: string): Promise<void> {
    try {
      switch (action) {
        case 'toggle':
          // Since TradingService only has getter, we'll just show the menu
          await this.showSmartTradeMenu(ctx, userId);
          break;

        default:
          await this.handleError(ctx, new Error('Invalid smart trade action'));
      }
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private calculateWinRate(stats: TradeStats): string {
    if (stats.totalTrades === 0) return '0.0';
    return ((stats.successfulTrades / stats.totalTrades) * 100).toFixed(1);
  }

  private formatPnL(amount: number): string {
    const prefix = amount >= 0 ? '+' : '';
    return `${prefix}${amount.toFixed(4)} SOL`;
  }

  private formatAmount(amount: number): string {
    return amount.toFixed(4);
  }

  private getTradeStatusEmoji(status: string): string {
    switch (status.toLowerCase()) {
      case 'completed': return '✅';
      case 'pending': return '⏳';
      case 'failed': return '❌';
      default: return '❓';
    }
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
