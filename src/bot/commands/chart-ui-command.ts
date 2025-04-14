import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import TelegramBot from 'node-telegram-bot-api';
import { BaseCommand } from './base-command';
import { ChartService } from '../../services/analytics/chart-service';
import { Command } from '../types';

export class ChartUICommand extends BaseCommand implements Command {
  readonly name = 'chartui';
  readonly description = 'Interactive chart interface';

  constructor(
    bot: Telegraf<Context<Update>> | TelegramBot,
    private chartService: ChartService
  ) {
    super(bot);
  }

  async execute(ctx: Context<Update>): Promise<void> {
    try {
      await this.showChartUI(ctx);
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    try {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const [action, tokenAddress, timeframe] = ctx.callbackQuery.data.split(':');
      
      switch (action) {
        case 'search_token':
          const chartData = await this.chartService.getTokenChartData(tokenAddress || 'SOL/USDC', timeframe || '1h');
          const chartText = await this.chartService.generateChartImage(chartData);
          await this.editMessage(ctx, chartText, {
            parse_mode: 'Markdown',
            reply_markup: this.getChartKeyboard()
          });
          break;
        case 'refresh_chart':
          const refreshedData = await this.chartService.getTokenChartData(tokenAddress || 'SOL/USDC', timeframe || '1h');
          const refreshedText = await this.chartService.generateChartImage(refreshedData);
          await this.editMessage(ctx, refreshedText, {
            parse_mode: 'Markdown',
            reply_markup: this.getChartKeyboard()
          });
          break;
        case 'back_to_chart':
          await this.showChartUI(ctx);
          break;
        case 'buy_token':
        case 'sell_token':
        case 'limit_order':
        case 'swap_token':
        case 'buy_gmgn':
        case 'sell_gmgn':
        case 'swap_gmgn':
          // Handle trading actions
          await this.handleTradeAction(ctx, action, tokenAddress);
          break;
        case 'charts':
          await this.showChartUI(ctx);
          break;
      }

      await ctx.answerCbQuery();
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  private async showChartUI(ctx: Context<Update>): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [{ text: '📊 SOL/USDC', callback_data: 'search_token' }],
        [{ text: '📈 BTC/USDC', callback_data: 'search_token' }],
        [{ text: '📉 ETH/USDC', callback_data: 'search_token' }]
      ]
    };

    await this.editMessage(ctx,
      '*📊 Chart Interface*\n\n' +
      'Select a trading pair to view its chart:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
    
  }

  private getChartKeyboard() {
    return {
      inline_keyboard: [
        [{ text: '1H', callback_data: 'refresh_chart:SOL/USDC:1h' }],
        [{ text: '4H', callback_data: 'refresh_chart:SOL/USDC:4h' }],
        [{ text: '1D', callback_data: 'refresh_chart:SOL/USDC:1d' }],
        [{ text: '🔄 Refresh', callback_data: 'refresh_chart:SOL/USDC:1h' }],
        [{ text: '🔙 Back', callback_data: 'back_to_chart' }]
      ]
    };
  }
}