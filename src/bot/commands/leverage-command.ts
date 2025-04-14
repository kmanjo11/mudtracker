import { Context } from 'telegraf';
import { Telegraf } from 'telegraf';
import TelegramBot from 'node-telegram-bot-api';
import { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import { BaseCommand } from './base-command';
import { TradeConfig } from '../../types/trading-types';
import { TradingService } from '../../services/trading/trading-service';
import { Message, Update } from 'telegraf/typings/core/types/typegram';
import { WalletService } from '../../services/wallet/wallet-service';

export class LeverageCommand extends BaseCommand {
  readonly name = 'leverage';
  readonly description = 'Execute leveraged trades';
  constructor(
    bot: Telegraf<Context<Update>> | TelegramBot,
    private tradingService: TradingService,
    private walletService: WalletService
  ) {
    super(bot);
  }

  async execute(ctx: Context<Update>): Promise<void> {
    try {
      const message = ctx.message as Message.TextMessage;
      const args = message.text?.split(' ').slice(1);

      if (!args || args.length < 3) {
        await ctx.reply(
          'Usage: /leverage <market> <amount> <direction> [leverage]\nExample: /leverage SOL/USDC 1 long 2'
        );
        return;
      }

      const [market, amountStr, direction] = args;
      const leverage = args[3] ? parseFloat(args[3]) : 2; // Default 2x leverage
      const amount = parseFloat(amountStr);
      const isLong = direction.toLowerCase() === 'long';

      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('Invalid amount. Please provide a positive number.');
        return;
      }

      if (isNaN(leverage) || leverage < 1 || leverage > 10) {
        await ctx.reply('Invalid leverage. Please provide a number between 1 and 10.');
        return;
      }

      // Get user's wallet
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await ctx.reply('Could not identify user.');
        return;
      }

      const wallet = await this.walletService.getWalletAddress(userId);
      if (!wallet) {
        await ctx.reply('No wallet connected. Please connect a wallet first using /connect.');
        return;
      }

      const walletSecretKey = await this.walletService.exportWallet(userId);
      if (!walletSecretKey) {
        await ctx.reply('Could not access wallet. Please ensure you have a valid wallet.');
        return;
      }

      // Create trade config
      const tradeConfig: TradeConfig = {
        userId,
        tokenAddress: market,
        amount,
        leverage,
        isLong,
        walletSecretKey
      };

      // Execute leverage trade
      const result = await this.tradingService.executeTrade(tradeConfig);

      if (result.success) {
        await ctx.reply(
          `✅ Successfully opened ${direction} position:\n` +
          `Market: ${market}\n` +
          `Amount: ${amount}\n` +
          `Leverage: ${leverage}x\n` +
          `Transaction: ${result.txId}`
        );
      } else {
        await ctx.reply(`❌ Failed to execute trade: ${result.error}`);
      }
    } catch (error) {
      console.error('Error in leverage command:', error);
      await ctx.reply('An error occurred while executing the leverage trade.');
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    try {
      const callbackQuery = ctx.callbackQuery as { data?: string };
      if (!callbackQuery?.data) {
        return;
      }

      const [action, market] = callbackQuery.data.split(':');
      if (action === 'close_position') {
        const userId = ctx.from?.id.toString();
        if (!userId) {
          await ctx.reply('Could not identify user.');
          return;
        }

        const position = await this.tradingService.getPosition(userId, market);
        if (!position) {
          await ctx.reply('No open position found for this market.');
          return;
        }

        // Close the position
        const wallet = await this.walletService.exportWallet(userId);
        if (!wallet) {
          await ctx.reply('Could not access wallet.');
          return;
        }

        const tradeConfig: TradeConfig = {
          userId,
          tokenAddress: market,
          amount: position.size,
          isLong: position.side === 'short', // Opposite side to close
          leverage: position.leverage,
          walletSecretKey: wallet
        };

        const result = await this.tradingService.executeTrade(tradeConfig);

        if (result.success) {
          await ctx.reply(
            `✅ Successfully closed position:\n` +
            `Market: ${market}\n` +
            `Size: ${position.size}\n` +
            `PnL: ${position.unrealizedPnl.toFixed(2)} USDC\n` +
            `Transaction: ${result.txId}`
          );
        } else {
          await ctx.reply(`❌ Failed to close position: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error in leverage callback:', error);
      await ctx.reply('An error occurred while processing the leverage command.');
    }
  }
}
