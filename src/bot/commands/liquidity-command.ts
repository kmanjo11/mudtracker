import { Context } from 'telegraf';
import { Telegraf } from 'telegraf';
import TelegramBot from 'node-telegram-bot-api';
import { Update } from 'telegraf/typings/core/types/typegram';
import { BaseCommand } from './base-command';
import { LiquidityService } from '../../services/trading/liquidity-service';
import { LiquidityPoolInfo } from '../../types';

export class LiquidityCommand extends BaseCommand {
  readonly name = 'liquidity';
  readonly description = 'View and manage liquidity pools';

  constructor(
    bot: Telegraf<Context<Update>> | TelegramBot,
    private liquidityService: LiquidityService
  ) {
    super(bot);
  }

  async execute(ctx: Context<Update>, args: string[] = []): Promise<void> {
    if (!ctx.chat) return;

    try {
      const pools = await this.liquidityService.getTopPools();
      await this.sendPoolList(ctx, pools);
    } catch (error) {
      console.error('Error in liquidity command:', error);
      await ctx.telegram.sendMessage(
        ctx.chat.id,
        '❌ Error fetching liquidity pools'
      );
    }
  }

  private async sendPoolList(ctx: Context, pools: LiquidityPoolInfo[]): Promise<void> {
    if (!ctx.chat) return;

    const keyboard = {
      inline_keyboard: pools.map(pool => [{
        text: `${pool.tokenA.symbol} - ${pool.tokenB.symbol}`,
        callback_data: `pool_${pool.id}`
      }])
    };

    await ctx.telegram.sendMessage(
      ctx.chat.id,
      '*🌊 Top Liquidity Pools*\n\n' +
      'Select a pool to view details:',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    if (!ctx.callbackQuery || !ctx.chat) return;

    const data = (ctx.callbackQuery as any).data;
    if (!data || !data.startsWith('pool_')) {
      await ctx.telegram.answerCbQuery(ctx.callbackQuery.id);
      return;
    }

    try {
      const poolId = data.slice(5);
      const pool = await this.liquidityService.getPoolInfo(poolId);
      
      if (!pool) {
        await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, '❌ Pool not found');
        return;
      }

      const message = 
        `*${pool.tokenA.symbol} - ${pool.tokenB.symbol}*\n` +
        `APR: ${pool.apr}%\n` +
        `TVL: $${this.formatNumber(pool.totalLiquidity)}\n` +
        `User Liquidity: $${pool.userLiquidity ? this.formatNumber(pool.userLiquidity) : '0'}`;

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        ctx.callbackQuery.message?.message_id,
        undefined,
        message,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '🔄 Refresh', callback_data: data },
              { text: '🔙 Back', callback_data: 'list_pools' }
            ]]
          }
        }
      );

      await ctx.telegram.answerCbQuery(ctx.callbackQuery.id);
    } catch (error) {
      console.error('Error handling liquidity callback:', error);
      await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, '❌ Error fetching pool info');
    }
  }

  private formatNumber(num: number): string {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}
