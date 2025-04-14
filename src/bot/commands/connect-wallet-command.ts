import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import TelegramBot from 'node-telegram-bot-api';
import { BaseCommand } from './base-command';
import { WalletService, WalletType } from '../../services/wallet/wallet-service';
import { WALLET_MENU } from '../../config/bot-menus';

export class ConnectWalletCommand extends BaseCommand {
  readonly name = 'connect'
  readonly description = 'Connect your wallet'

  constructor(bot: Telegraf<Context<Update>> | TelegramBot, private walletService: WalletService) {
    super(bot)
  }

  async execute(ctx: Context<Update>): Promise<void> {
    try {
      if (!ctx.from) return;

      const userId = ctx.from.id.toString();
      const activeWallet = await this.walletService.getActiveWallet(userId);

      let message = '🔌 *Wallet Connection*\n\n';
      
      if (activeWallet) {
        message += `Current Active Wallet:\n`;
        message += `Type: ${activeWallet.type === WalletType.PHANTOM ? '👻 Phantom' : '💼 System'}\n`;
        message += `Address: \`${activeWallet.address}\`\n\n`;
      } else {
        message += 'No wallet connected. Choose an option below:\n';
      }

      await this.editMessage(ctx, message, {
        parse_mode: 'Markdown',
        reply_markup: WALLET_MENU
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    try {
      if (!ctx.callbackQuery || !ctx.from || !('data' in ctx.callbackQuery)) return;
      
      const callbackData = ctx.callbackQuery.data;
      const userId = ctx.from.id.toString();

      switch (callbackData) {
        case 'connect_phantom':
          const qrCode = await this.walletService.getPhantomConnectionQR(userId);
          await this.editMessage(ctx, '👻 *Connect Your Phantom Wallet*\n\nScan this QR code with your Phantom mobile app:', {
            parse_mode: 'Markdown'
          });
          
          if (this.isTelegraf(this.bot)) {
            await ctx.replyWithPhoto({ url: qrCode });
          } else {
            const chatId = this.getChatId(ctx);
            if (chatId) {
              await this.bot.sendPhoto(chatId, qrCode);
            }
          }
          break;

        case 'use_system_wallet':
          const systemWallet = await this.walletService.createOrGetSystemWallet(userId);
          await this.walletService.setActiveWallet(userId, {
            type: WalletType.BOT_GENERATED,
            address: systemWallet
          });
          await this.editMessage(ctx, '💼 *System Wallet Activated*\n\nYour system wallet is now set as active.', {
            parse_mode: 'Markdown'
          });
          break;

        case 'switch_wallet':
          const wallets = await this.walletService.getUserWallets(userId);
          if (wallets.length < 2) {
            await this.editMessage(ctx, '❌ You need at least two wallets to switch between them.');
            return;
          }
          
          const keyboard = {
            inline_keyboard: wallets.map(w => [{
              text: `${w.type === WalletType.PHANTOM ? '👻' : '💼'} ${w.address.slice(0, 8)}...`,
              callback_data: `select_wallet:${w.address}`
            }])
          };
          await this.editMessage(ctx, 'Select a wallet to make active:', { reply_markup: keyboard });
          break;

        case 'view_active_wallet':
          const active = await this.walletService.getActiveWallet(userId);
          if (!active) {
            await this.editMessage(ctx, '❌ No active wallet found.');
            return;
          }
          const balance = await this.walletService.getWalletBalance(active.address);
          await this.editMessage(ctx,
            `*Active Wallet Details*\n\n` +
            `Type: ${active.type === WalletType.PHANTOM ? '👻 Phantom' : '💼 System'}\n` +
            `Address: \`${active.address}\`\n` +
            `Balance: ${balance} SOL`, {
              parse_mode: 'Markdown'
            }
          );
          break;

        default:
          if (callbackData.startsWith('select_wallet:')) {
            const address = callbackData.split(':')[1];
            const wallet = (await this.walletService.getUserWallets(userId))
              .find(w => w.address === address);
            
            if (wallet) {
              await this.walletService.setActiveWallet(userId, wallet);
              await this.editMessage(ctx,
                `✅ Switched to ${wallet.type === WalletType.PHANTOM ? '👻 Phantom' : '💼 System'} wallet:\n` +
                `\`${wallet.address}\``, {
                  parse_mode: 'Markdown'
                }
              );
            }
          }
          break;
      }

      // Answer callback query to remove loading state
      await ctx.answerCbQuery();
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }

  protected getChatId(ctx: Context<Update>): number | undefined {
    if ('message' in ctx.update) {
      return ctx.update.message.chat.id;
    } else if ('callback_query' in ctx.update && ctx.update.callback_query.message) {
      return ctx.update.callback_query.message.chat.id;
    }
    return undefined;
  }
}
