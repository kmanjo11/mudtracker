import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { BaseCommand } from './base-command';
import { ChartService } from '../../services/analytics/chart-service';
import { Command } from '../types';
import * as fs from 'fs';

export class ChartUICommand extends BaseCommand implements Command {
  readonly name = 'chartui';
  readonly description = 'Interactive chart interface';

  constructor(
    private bot: Telegraf<Context<Update>>,
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
          await this.displayChart(ctx, tokenAddress || 'SOL/USDC', timeframe || '1h');
          break;
        case 'refresh_chart':
          await this.displayChart(ctx, tokenAddress || 'SOL/USDC', timeframe || '1h');
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

  private async displayChart(ctx: Context<Update>, symbol: string, timeframe: string): Promise<void> {
    try {
      // Show loading message
      await ctx.editMessageText('Loading chart data...', { parse_mode: 'Markdown' });
      
      // Get chart data
      const chartData = await this.chartService.getTokenChartData(symbol, timeframe);
      
      // Generate chart image
      const chartImagePath = await this.chartService.generateChartImage(chartData, symbol, timeframe);
      
      // Check if we got an image path or a text summary
      if (chartImagePath.includes('.png')) {
        // Send image with keyboard
        await ctx.deleteMessage();
        await ctx.replyWithPhoto(
          { source: fs.readFileSync(chartImagePath) },
          {
            caption: `📊 ${symbol} Chart (${timeframe})`,
            reply_markup: this.getChartKeyboard(symbol)
          }
        );
        
        // Clean up the temporary file
        try {
          fs.unlinkSync(chartImagePath);
        } catch (error) {
          console.error('Error deleting temporary chart file:', error);
        }
      } else {
        // If we got a text summary instead of an image path
        await ctx.editMessageText(chartImagePath, {
          parse_mode: 'Markdown',
          reply_markup: this.getChartKeyboard(symbol)
        });
      }
    } catch (error) {
      console.error('Error displaying chart:', error);
      await ctx.editMessageText(
        '❌ Error loading chart data. Please try again later.',
        {
          parse_mode: 'Markdown',
          reply_markup: this.getChartKeyboard(symbol)
        }
      );
    }
  }

  private async showChartUI(ctx: Context<Update>): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [{ text: '📊 SOL/USDC', callback_data: 'search_token:SOL/USDC:1h' }],
        [{ text: '📈 BTC/USDC', callback_data: 'search_token:BTC/USDC:1h' }],
        [{ text: '📉 ETH/USDC', callback_data: 'search_token:ETH/USDC:1h' }]
      ]
    };

    if (ctx.callbackQuery) {
      await ctx.editMessageText(
        '*📊 Chart Interface*\n\n' +
        'Select a trading pair to view its chart:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } else {
      await ctx.reply(
        '*📊 Chart Interface*\n\n' +
        'Select a trading pair to view its chart:',
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    }
  }

  private getChartKeyboard(symbol: string) {
    return {
      inline_keyboard: [
        [
          { text: '1H', callback_data: `refresh_chart:${symbol}:1h` },
          { text: '4H', callback_data: `refresh_chart:${symbol}:4h` },
          { text: '1D', callback_data: `refresh_chart:${symbol}:1d` }
        ],
        [{ text: '🔄 Refresh', callback_data: `refresh_chart:${symbol}:1h` }],
        [{ text: '🔙 Back', callback_data: 'back_to_chart' }]
      ]
    };
  }
}
