import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { BaseCommand } from './base-command';
import { Command } from '../types';
import { LiquidityPoolService } from '../../services/trading/liquidity-pool-service';
import { RpcConnectionManager } from '../../providers/solana';
import { PrismaUserRepository } from '../../repositories/prisma/user';
import { WalletService } from '../../services/wallet/wallet-service';
import { formatNumber } from '../../utils/format';

export class LiquidityCommand extends BaseCommand implements Command {
  readonly name = 'liquidity';
  readonly description = 'Manage liquidity pool positions';
  
  private readonly liquidityPoolService: LiquidityPoolService;
  private readonly prismaUserRepository: PrismaUserRepository;
  private readonly walletService: WalletService;
  
  constructor(bot: Telegraf<Context<Update>>) {
    super(bot);
    this.liquidityPoolService = new LiquidityPoolService(RpcConnectionManager.connections[0]);
    this.prismaUserRepository = new PrismaUserRepository();
    this.walletService = new WalletService(RpcConnectionManager.connections[0]);
  }
  
  async execute(ctx: Context<Update>): Promise<void> {
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await this.handleError(ctx, new Error('User ID not found'));
        return;
      }
      
      await this.showLiquidityDashboard(ctx, userId);
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
      
      const userId = ctx.from?.id.toString();
      if (!userId) {
        await this.handleError(ctx, new Error('User ID not found'));
        return;
      }
      
      const data = ctx.callbackQuery.data;
      const [section, action, ...params] = data.split(':');
      
      if (section === 'liquidity') {
        switch (action) {
          case 'dashboard':
            await this.showLiquidityDashboard(ctx, userId);
            break;
            
          case 'positions':
            await this.showUserPositions(ctx, userId);
            break;
            
          case 'pools':
            await this.showPopularPools(ctx, userId);
            break;
            
          case 'pool':
            if (params.length > 0) {
              await this.showPoolDetails(ctx, userId, params[0]);
            }
            break;
            
          case 'add':
            if (params.length > 0) {
              await this.showAddLiquidityForm(ctx, userId, params[0]);
            } else {
              await this.showSelectPoolForAddLiquidity(ctx, userId);
            }
            break;
            
          case 'remove':
            if (params.length > 0) {
              await this.showRemoveLiquidityForm(ctx, userId, params[0]);
            }
            break;
            
          case 'search':
            await this.showSearchPoolsForm(ctx, userId);
            break;
            
          default:
            await this.showLiquidityDashboard(ctx, userId);
        }
      }
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
  
  private async showLiquidityDashboard(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      // Get user wallet
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId);
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'));
        return;
      }
      
      // Get user positions
      const positions = await this.liquidityPoolService.getUserPositions(userWallet.personalWalletPubKey);
      
      // Calculate total value
      const totalValue = positions.reduce((sum, pos) => sum + pos.value, 0);
      
      let messageText = `
<b>🏊‍♂️ Liquidity Pool Dashboard</b>

<b>Total Liquidity Value:</b> $${formatNumber(totalValue, 2)}
<b>Active Positions:</b> ${positions.length}
`;

      if (positions.length > 0) {
        messageText += '\n<b>Your Positions:</b>\n';
        
        for (const position of positions) {
          const poolInfo = await this.liquidityPoolService.getPoolInfo(position.poolId);
          if (poolInfo) {
            messageText += `• ${poolInfo.name}: $${formatNumber(position.value, 2)} (${(position.share * 100).toFixed(4)}%)\n`;
          }
        }
      } else {
        messageText += '\nYou don\'t have any active liquidity positions yet.';
      }
      
      messageText += '\n\nUse the buttons below to manage your liquidity positions.';
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🏊‍♂️ My Positions', callback_data: 'liquidity:positions' },
            { text: '🔍 Browse Pools', callback_data: 'liquidity:pools' }
          ],
          [
            { text: '➕ Add Liquidity', callback_data: 'liquidity:add' },
            { text: '🔍 Search Pools', callback_data: 'liquidity:search' }
          ],
          [
            { text: '🔙 Back to Menu', callback_data: 'main:menu' }
          ]
        ]
      };
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
  
  private async showUserPositions(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      // Get user wallet
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId);
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'));
        return;
      }
      
      // Get user positions
      const positions = await this.liquidityPoolService.getUserPositions(userWallet.personalWalletPubKey);
      
      let messageText = `
<b>🏊‍♂️ Your Liquidity Positions</b>
`;

      if (positions.length > 0) {
        for (const position of positions) {
          const poolInfo = await this.liquidityPoolService.getPoolInfo(position.poolId);
          if (poolInfo) {
            messageText += `\n<b>${poolInfo.name}</b>\n`;
            messageText += `• Value: $${formatNumber(position.value, 2)}\n`;
            messageText += `• Share: ${(position.share * 100).toFixed(4)}%\n`;
            messageText += `• ${poolInfo.tokenA.symbol}: ${formatNumber(position.tokenAAmount, 6)}\n`;
            messageText += `• ${poolInfo.tokenB.symbol}: ${formatNumber(position.tokenBAmount, 6)}\n`;
          }
        }
      } else {
        messageText += '\nYou don\'t have any active liquidity positions yet.';
      }
      
      // Create position buttons
      const positionButtons = positions.map(position => {
        return {
          text: `Manage ${position.poolId.replace('pool', 'Pool ')}`,
          callback_data: `liquidity:pool:${position.poolId}`
        };
      });
      
      // Split into rows of 1 button
      const positionRows = positionButtons.map(button => [button]);
      
      const menu = {
        inline_keyboard: [
          ...positionRows,
          [
            { text: '➕ Add Liquidity', callback_data: 'liquidity:add' },
            { text: '🔙 Back', callback_data: 'liquidity:dashboard' }
          ]
        ]
      };
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
  
  private async showPopularPools(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      // Get popular pools
      const pools = await this.liquidityPoolService.getPopularPools(5);
      
      let messageText = `
<b>🔝 Popular Liquidity Pools</b>

Browse popular liquidity pools to add liquidity:
`;

      for (const pool of pools) {
        messageText += `\n<b>${pool.name}</b>\n`;
        messageText += `• TVL: $${formatNumber(pool.tvl, 0)}\n`;
        messageText += `• APY: ${pool.apy.toFixed(2)}%\n`;
        messageText += `• 24h Volume: $${formatNumber(pool.volume24h, 0)}\n`;
      }
      
      // Create pool buttons
      const poolButtons = pools.map(pool => {
        return {
          text: pool.name,
          callback_data: `liquidity:pool:${pool.id}`
        };
      });
      
      // Split into rows of 2 buttons
      const poolRows = [];
      for (let i = 0; i < poolButtons.length; i += 2) {
        poolRows.push(poolButtons.slice(i, i + 2));
      }
      
      const menu = {
        inline_keyboard: [
          ...poolRows,
          [
            { text: '🔍 Search Pools', callback_data: 'liquidity:search' },
            { text: '🔙 Back', callback_data: 'liquidity:dashboard' }
          ]
        ]
      };
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
  
  private async showPoolDetails(ctx: Context<Update>, userId: string, poolId: string): Promise<void> {
    try {
      // Get pool info
      const poolInfo = await this.liquidityPoolService.getPoolInfo(poolId);
      if (!poolInfo) {
        await this.handleError(ctx, new Error('Pool not found'));
        return;
      }
      
      // Get user wallet
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId);
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'));
        return;
      }
      
      // Get user position in this pool
      const positions = await this.liquidityPoolService.getUserPositions(userWallet.personalWalletPubKey);
      const position = positions.find(p => p.poolId === poolId);
      
      let messageText = this.liquidityPoolService.formatPoolInfo(poolInfo);
      
      if (position) {
        messageText += '\n<b>Your Position:</b>\n';
        messageText += `• Value: $${formatNumber(position.value, 2)}\n`;
        messageText += `• Share: ${(position.share * 100).toFixed(4)}%\n`;
        messageText += `• ${poolInfo.tokenA.symbol}: ${formatNumber(position.tokenAAmount, 6)}\n`;
        messageText += `• ${poolInfo.tokenB.symbol}: ${formatNumber(position.tokenBAmount, 6)}\n`;
      } else {
        messageText += '\nYou don\'t have a position in this pool yet.';
      }
      
      const menu = {
        inline_keyboard: [
          [
            { text: '➕ Add Liquidity', callback_data: `liquidity:add:${poolId}` },
            position ? { text: '➖ Remove Liquidity', callback_data: `liquidity:remove:${poolId}` } : { text: '📊 Pool Stats', callback_data: `liquidity:stats:${poolId}` }
          ],
          [
            { text: '🔙 Back to Pools', callback_data: 'liquidity:pools' }
          ]
        ]
      };
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
  
  private async showSelectPoolForAddLiquidity(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      // Get popular pools
      const pools = await this.liquidityPoolService.getPopularPools(5);
      
      let messageText = `
<b>➕ Add Liquidity</b>

Select a pool to add liquidity:
`;

      // Create pool buttons
      const poolButtons = pools.map(pool => {
        return {
          text: pool.name,
          callback_data: `liquidity:add:${pool.id}`
        };
      });
      
      // Split into rows of 1 button
      const poolRows = poolButtons.map(button => [button]);
      
      const menu = {
        inline_keyboard: [
          ...poolRows,
          [
            { text: '🔍 Search Pools', callback_data: 'liquidity:search' },
            { text: '🔙 Back', callback_data: 'liquidity:dashboard' }
          ]
        ]
      };
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
  
  private async showAddLiquidityForm(ctx: Context<Update>, userId: string, poolId: string): Promise<void> {
    try {
      // Get pool info
      const poolInfo = await this.liquidityPoolService.getPoolInfo(poolId);
      if (!poolInfo) {
        await this.handleError(ctx, new Error('Pool not found'));
        return;
      }
      
      let messageText = `
<b>➕ Add Liquidity to ${poolInfo.name}</b>

To add liquidity to this pool, you need to provide both tokens:

• ${poolInfo.tokenA.symbol} (${poolInfo.tokenA.name})
• ${poolInfo.tokenB.symbol} (${poolInfo.tokenB.name})

<b>Pool Information:</b>
• Current APY: ${poolInfo.apy.toFixed(2)}%
• Fee: ${poolInfo.fee}%
• TVL: $${formatNumber(poolInfo.tvl, 0)}

<i>Note: This feature will be fully implemented soon. For now, you can browse pools and view information.</i>
`;
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🔙 Back to Pool', callback_data: `liquidity:pool:${poolId}` }
          ]
        ]
      };
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
  
  private async showRemoveLiquidityForm(ctx: Context<Update>, userId: string, poolId: string): Promise<void> {
    try {
      // Get pool info
      const poolInfo = await this.liquidityPoolService.getPoolInfo(poolId);
      if (!poolInfo) {
        await this.handleError(ctx, new Error('Pool not found'));
        return;
      }
      
      // Get user wallet
      const userWallet = await this.prismaUserRepository.getPersonalWallet(userId);
      if (!userWallet) {
        await this.handleError(ctx, new Error('Wallet not found'));
        return;
      }
      
      // Get user position in this pool
      const positions = await this.liquidityPoolService.getUserPositions(userWallet.personalWalletPubKey);
      const position = positions.find(p => p.poolId === poolId);
      
      if (!position) {
        await this.handleError(ctx, new Error('You don\'t have a position in this pool'));
        return;
      }
      
      let messageText = `
<b>➖ Remove Liquidity from ${poolInfo.name}</b>

Your current position:
• Value: $${formatNumber(position.value, 2)}
• ${poolInfo.tokenA.symbol}: ${formatNumber(position.tokenAAmount, 6)}
• ${poolInfo.tokenB.symbol}: ${formatNumber(position.tokenBAmount, 6)}
• Pool Share: ${(position.share * 100).toFixed(4)}%

<i>Note: This feature will be fully implemented soon. For now, you can browse pools and view information.</i>
`;
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🔙 Back to Pool', callback_data: `liquidity:pool:${poolId}` }
          ]
        ]
      };
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
  
  private async showSearchPoolsForm(ctx: Context<Update>, userId: string): Promise<void> {
    try {
      let messageText = `
<b>🔍 Search Liquidity Pools</b>

Enter a token name or symbol to find related liquidity pools.

<i>Note: This feature will be fully implemented soon. For now, you can browse popular pools.</i>
`;
      
      const menu = {
        inline_keyboard: [
          [
            { text: '🔝 Popular Pools', callback_data: 'liquidity:pools' },
            { text: '🔙 Back', callback_data: 'liquidity:dashboard' }
          ]
        ]
      };
      
      await this.editMessage(ctx, messageText, {
        parse_mode: 'HTML',
        reply_markup: menu
      });
    } catch (error) {
      await this.handleError(ctx, error);
    }
  }
}
