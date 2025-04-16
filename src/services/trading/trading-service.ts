import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair } from '@solana/web3.js';
import { LRUCache } from 'lru-cache';
import { retry } from '../../utils/retry';
import { TradingStats, TradeConfig, TradingStrategy, SmartTradeConfig, TradeValidation, Trade } from '../../types/trading-types';
import { env } from '../../utils/env';
import { MangoService } from './mango-service';
import { JupiterService } from './jupiter-service';
import { WalletService } from '../wallet/wallet-service';
import { NitterService } from '../social/nitter-service';
import { CircuitBreaker } from '../circuit-breaker/circuit-breaker';

interface TradeResult {
  success: boolean;
  txId?: string;
  error?: string;
  timestamp: Date;
}

interface TradingStrategyConfig {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  minAmount: number;
  maxAmount: number;
  slippageTolerance: number;
}

export class TradingService {
  private readonly connection: Connection;
  private readonly userStats: LRUCache<string, TradingStats>;
  private strategies: Map<string, TradingStrategy>;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private readonly mangoService: MangoService;
  private readonly jupiterService: JupiterService;
  private readonly walletService: WalletService;
  private readonly nitterService: NitterService;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly activeTrades: Map<string, Trade[]>;

  constructor(connection: Connection, walletService: WalletService) {
    this.connection = connection;
    this.walletService = walletService;
    this.userStats = new LRUCache({ 
      max: 1000,
      ttl: 1000 * 60 * 60,  // 1 hour
      allowStale: false,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
    this.strategies = new Map<string, TradingStrategy>();
    this.mangoService = new MangoService(connection);
    this.jupiterService = new JupiterService(connection);
    this.nitterService = new NitterService();
    this.circuitBreaker = new CircuitBreaker('trading', {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitorInterval: 10000
    });
    this.activeTrades = new Map<string, Trade[]>();
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    const strategies: [string, TradingStrategy][] = [
      ['conservative', {
        name: 'Conservative',
        description: 'Low risk, stable returns',
        riskLevel: 'low',
        async evaluateConditions(config: SmartTradeConfig) {
          return { shouldEnter: false, confidence: 0, reasons: [] };
        },
        async calculateEntryPrice(config: SmartTradeConfig) {
          return { price: 0, confidence: 0, validUntil: new Date() };
        },
        async calculateExitPrice(config: SmartTradeConfig) {
          return { price: 0, type: 'stopLoss' as const, reason: '' };
        }
      }],
      ['balanced', {
        name: 'Balanced',
        description: 'Medium risk, moderate returns',
        riskLevel: 'medium',
        async evaluateConditions(config: SmartTradeConfig) {
          return { shouldEnter: false, confidence: 0, reasons: [] };
        },
        async calculateEntryPrice(config: SmartTradeConfig) {
          return { price: 0, confidence: 0, validUntil: new Date() };
        },
        async calculateExitPrice(config: SmartTradeConfig) {
          return { price: 0, type: 'stopLoss' as const, reason: '' };
        }
      }],
      ['aggressive', {
        name: 'Aggressive',
        description: 'High risk, high potential returns',
        riskLevel: 'high',
        async evaluateConditions(config: SmartTradeConfig) {
          return { shouldEnter: false, confidence: 0, reasons: [] };
        },
        async calculateEntryPrice(config: SmartTradeConfig) {
          return { price: 0, confidence: 0, validUntil: new Date() };
        },
        async calculateExitPrice(config: SmartTradeConfig) {
          return { price: 0, type: 'stopLoss' as const, reason: '' };
        }
      }]
    ];
    
    this.strategies = new Map(strategies);
  }

  public async executeTrade(config: TradeConfig): Promise<TradeResult> {
    return this.circuitBreaker.execute(async () => {
      try {
        // Validate trade configuration
        const validation = await this.validateTradeConfig(config);
        if (!validation.isValid) {
          return {
            success: false,
            error: validation.errors.join(', '),
            timestamp: new Date(),
          };
        }

        // If leverage is specified, use Mango for perpetual trading
        if (config.leverage && config.leverage > 1) {
          return this.executeLeverageTrade(config);
        }

        // Get wallet information
        const walletInfo = await this.walletService.getWalletAddress(config.userId);
        if (!walletInfo) {
          return {
            success: false,
            error: 'Wallet not found',
            timestamp: new Date(),
          };
        }

        // Execute spot trade using Jupiter
        let txId: string;
        
        if (config.tradeType === 'buy') {
          // For buy, we swap USDC (or other stablecoin) to the target token
          txId = await this.executeJupiterSwap(
            config.userId,
            config.stablecoinAddress || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Default to USDC
            config.tokenAddress,
            config.amount.toString(),
            config.slippage || 50
          );
        } else {
          // For sell, we swap the token to USDC (or other stablecoin)
          txId = await this.executeJupiterSwap(
            config.userId,
            config.tokenAddress,
            config.stablecoinAddress || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Default to USDC
            config.amount.toString(),
            config.slippage || 50
          );
        }

        // Update user statistics
        await this.updateUserStats(config.userId, { 
          success: true, 
          amount: config.amount,
          tokenAddress: config.tokenAddress,
          tradeType: config.tradeType
        });

        // Record the trade
        this.recordTrade(config.userId, {
          type: config.tradeType === 'buy' ? 'BUY' : 'SELL',
          symbol: config.symbol || 'Unknown/USDC',
          price: config.price || 0,
          amount: config.amount,
          status: 'completed',
          timestamp: new Date(),
          txId
        });

        return {
          success: true,
          txId,
          timestamp: new Date(),
        };

      } catch (error) {
        console.error('Trade execution failed:', error);
        
        // Update user statistics for failed trade
        await this.updateUserStats(config.userId, { 
          success: false, 
          amount: config.amount,
          tokenAddress: config.tokenAddress,
          tradeType: config.tradeType
        });
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          timestamp: new Date(),
        };
      }
    });
  }

  private async executeJupiterSwap(
    userId: string,
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number
  ): Promise<string> {
    // Get wallet keypair
    const walletInfo = await this.walletService.exportWallet(userId);
    if (!walletInfo) {
      throw new Error('Failed to get wallet information');
    }

    // Create keypair from secret key
    const keypair = Keypair.fromSecretKey(
      Buffer.from(walletInfo, 'base64')
    );

    // Execute swap using Jupiter
    return this.jupiterService.executeSwap(
      keypair,
      inputMint,
      outputMint,
      amount,
      slippageBps
    );
  }

  private async executeLeverageTrade(config: TradeConfig): Promise<TradeResult> {
    try {
      if (!config.walletSecretKey) {
        throw new Error('Wallet secret key is required for leverage trading');
      }

      const wallet = Keypair.fromSecretKey(Buffer.from(config.walletSecretKey, 'base64'));
      
      // Open leverage position
      const txId = await this.mangoService.openLeveragePosition(
        wallet,
        config.tokenAddress,
        config.amount,
        config.isLong ?? true,
        config.leverage ?? 2
      );

      // Record the trade
      this.recordTrade(config.userId, {
        type: config.isLong ? 'LONG' : 'SHORT',
        symbol: config.symbol || 'Unknown/USDC',
        price: config.price || 0,
        amount: config.amount,
        status: 'completed',
        timestamp: new Date(),
        txId
      });

      return {
        success: true,
        txId,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error executing leverage trade:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  async getPosition(userId: string, market: string): Promise<any> {
    const userWallet = await this.walletService.getWalletAddress(userId);
    if (!userWallet) {
      throw new Error('User wallet not found');
    }

    return this.mangoService.getPosition(new PublicKey(userWallet), market);
  }

  private async validateTradeConfig(config: TradeConfig): Promise<TradeValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Validate token address
      if (!config.tokenAddress) {
        errors.push('Token address is required');
      } else {
        try {
          new PublicKey(config.tokenAddress);
          
          // Check if token is supported by Jupiter
          const isSupported = await this.jupiterService.isTokenSupported(config.tokenAddress);
          if (!isSupported) {
            errors.push('Token not supported for trading');
          }
        } catch {
          errors.push('Invalid token address');
        }
      }

      // Validate amount
      if (!config.amount || config.amount <= 0) {
        errors.push('Invalid trade amount');
      }

      // Validate slippage
      if (config.slippage !== undefined && (config.slippage < 0 || config.slippage > 100)) {
        errors.push('Slippage must be between 0 and 100');
      }

      // Validate strategy
      if (config.strategy && !this.strategies.has(config.strategy)) {
        errors.push(`Invalid strategy: ${config.strategy}`);
      }

      // Validate user ID
      if (!config.userId) {
        errors.push('User ID is required');
      }

      // Validate trade type
      if (!config.tradeType || !['buy', 'sell'].includes(config.tradeType)) {
        errors.push('Invalid trade type. Must be "buy" or "sell"');
      }

      // Add warnings for optional parameters
      if (!config.stopLoss && !config.takeProfit) {
        warnings.push('No stop loss or take profit levels set');
      }

      if (config.leverage && config.leverage > 10) {
        warnings.push('High leverage trading is risky');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid configuration');
      return {
        isValid: false,
        errors,
        warnings
      };
    }
  }

  public async getUserStats(userId: string): Promise<TradingStats> {
    const stats = this.userStats.get(userId);
    if (!stats) {
      return {
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalVolume: 0,
        profitLoss: 0,
        lastUpdated: new Date()
      };
    }
    return { ...stats }; // Return a copy to prevent mutation
  }

  private async updateUserStats(
    userId: string, 
    tradeResult: { 
      success: boolean; 
      amount: number;
      tokenAddress?: string;
      tradeType?: string;
    }
  ): Promise<void> {
    const currentStats = await this.getUserStats(userId);
    
    const updatedStats: TradingStats = {
      totalTrades: currentStats.totalTrades + 1,
      successfulTrades: currentStats.successfulTrades + (tradeResult.success ? 1 : 0),
      failedTrades: currentStats.failedTrades + (tradeResult.success ? 0 : 1),
      totalVolume: currentStats.totalVolume + tradeResult.amount,
      profitLoss: currentStats.profitLoss, // Would need price data to calculate actual P/L
      lastUpdated: new Date()
    };

    this.userStats.set(userId, updatedStats);
  }

  public getAvailableStrategies(): TradingStrategy[] {
    return Array.from(this.strategies.values());
  }

  public getStrategy(type: string): TradingStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`Strategy ${type} not found`);
    }
    return { ...strategy }; // Return a copy to prevent mutation
  }

  private recordTrade(userId: string, trade: Trade): void {
    const userTrades = this.activeTrades.get(userId) || [];
    userTrades.unshift(trade); // Add to beginning of array
    
    // Keep only the last 50 trades
    if (userTrades.length > 50) {
      userTrades.pop();
    }
    
    this.activeTrades.set(userId, userTrades);
  }

  public async getRecentTrades(userId: string): Promise<Trade[]> {
    try {
      // Return recorded trades for this user
      return this.activeTrades.get(userId) || [];
    } catch (error) {
      console.error('Error fetching recent trades:', error);
      return [];
    }
  }

  public async getSmartTradeConfig(userId: string): Promise<{ enabled: boolean, riskLevel?: string }> {
    // In a real implementation, this would fetch from a database
    // For now, return a mock configuration
    return { 
      enabled: true,
      riskLevel: 'medium'
    };
  }

  public async updateSmartTradeConfig(
    userId: string, 
    config: { enabled: boolean, riskLevel?: string }
  ): Promise<boolean> {
    try {
      // In a real implementation, this would update the database
      // For now, just log the update
      console.log(`Updated smart trade config for user ${userId}:`, config);
      return true;
    } catch (error) {
      console.error('Error updating smart trade config:', error);
      return false;
    }
  }

  public async getTokenPrice(tokenAddress: string, quoteAddress: string = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'): Promise<number> {
    try {
      return await this.jupiterService.getPrice(tokenAddress, quoteAddress);
    } catch (error) {
      console.error('Error getting token price:', error);
      return 0;
    }
  }

  public async getSocialSentiment(tokenSymbol: string): Promise<{
    score: number;
    trending: boolean;
    analysis: string[];
  }> {
    try {
      const result = await this.nitterService.analyze(tokenSymbol);
      return {
        score: result.score,
        trending: result.trending,
        analysis: result.analysis
      };
    } catch (error) {
      console.error('Error getting social sentiment:', error);
      return {
        score: 0,
        trending: false,
        analysis: ['Error analyzing social data']
      };
    }
  }

  public async provideLiquidity(
    userId: string,
    tokenAAddress: string,
    tokenBAddress: string,
    amountA: number,
    amountB: number
  ): Promise<TradeResult> {
    // This would be implemented with Raydium SDK in a real implementation
    // For now, return a mock result
    return {
      success: true,
      txId: 'mock_liquidity_provision_tx',
      timestamp: new Date()
    };
  }

  public async removeLiquidity(
    userId: string,
    poolAddress: string,
    percentage: number
  ): Promise<TradeResult> {
    // This would be implemented with Raydium SDK in a real implementation
    // For now, return a mock result
    return {
      success: true,
      txId: 'mock_liquidity_removal_tx',
      timestamp: new Date()
    };
  }
}
