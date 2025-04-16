import { Connection } from '@solana/web3.js';
import { formatNumber } from '../../utils/format';
import { TokenService } from '../wallet/token-service';

interface WalletStats {
  address: string;
  totalValue: number;
  tokenCount: number;
  lastUpdated: Date;
  changePercentage24h: number;
}

interface TokenStats {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  value: number;
  price: number;
  priceChange24h: number;
  lastUpdated: Date;
}

export class WalletStatsService {
  private readonly connection: Connection;
  private readonly tokenService: TokenService;
  private walletStatsCache: Map<string, WalletStats>;
  private tokenStatsCache: Map<string, Map<string, TokenStats>>;
  private readonly CACHE_TTL = 60000; // 1 minute in milliseconds

  constructor(connection: Connection) {
    this.connection = connection;
    this.tokenService = new TokenService(connection);
    this.walletStatsCache = new Map();
    this.tokenStatsCache = new Map();
  }

  /**
   * Get real-time wallet statistics
   * @param walletAddress The wallet address to check
   * @returns Wallet statistics
   */
  async getWalletStats(walletAddress: string): Promise<WalletStats> {
    // Check cache first
    const cachedStats = this.walletStatsCache.get(walletAddress);
    const now = Date.now();
    
    if (cachedStats && now - cachedStats.lastUpdated.getTime() < this.CACHE_TTL) {
      return cachedStats;
    }
    
    try {
      // Get token balances with prices
      const tokenBalances = await this.tokenService.getTokenBalancesWithPrices(walletAddress);
      
      // Calculate total portfolio value
      const totalValue = this.tokenService.calculatePortfolioValue(tokenBalances);
      
      // Create wallet stats
      const walletStats: WalletStats = {
        address: walletAddress,
        totalValue,
        tokenCount: tokenBalances.length,
        lastUpdated: new Date(),
        changePercentage24h: 0 // Would need historical data to calculate this
      };
      
      // Cache the result
      this.walletStatsCache.set(walletAddress, walletStats);
      
      // Also update token stats cache
      const tokenStatsMap = new Map<string, TokenStats>();
      
      for (const token of tokenBalances) {
        tokenStatsMap.set(token.mint, {
          mint: token.mint,
          symbol: token.symbol,
          name: token.name,
          balance: token.uiAmount,
          value: token.value || 0,
          price: token.price || 0,
          priceChange24h: 0, // Would need historical data to calculate this
          lastUpdated: new Date()
        });
      }
      
      this.tokenStatsCache.set(walletAddress, tokenStatsMap);
      
      return walletStats;
    } catch (error) {
      console.error('Error getting wallet stats:', error);
      
      // If we have cached data, return it even if expired
      if (cachedStats) {
        return cachedStats;
      }
      
      // Return empty stats if no data available
      return {
        address: walletAddress,
        totalValue: 0,
        tokenCount: 0,
        lastUpdated: new Date(),
        changePercentage24h: 0
      };
    }
  }

  /**
   * Get real-time token statistics for a wallet
   * @param walletAddress The wallet address to check
   * @param mintAddress Optional mint address to filter by
   * @returns Token statistics
   */
  async getTokenStats(walletAddress: string, mintAddress?: string): Promise<TokenStats[]> {
    // Ensure wallet stats are up to date (this will also update token stats)
    await this.getWalletStats(walletAddress);
    
    // Get token stats from cache
    const tokenStatsMap = this.tokenStatsCache.get(walletAddress);
    
    if (!tokenStatsMap) {
      return [];
    }
    
    // If mint address is provided, return only that token
    if (mintAddress) {
      const tokenStats = tokenStatsMap.get(mintAddress);
      return tokenStats ? [tokenStats] : [];
    }
    
    // Otherwise return all tokens
    return Array.from(tokenStatsMap.values());
  }

  /**
   * Format wallet stats for display
   * @param stats Wallet statistics
   * @returns Formatted string
   */
  formatWalletStats(stats: WalletStats): string {
    const changeStr = stats.changePercentage24h > 0 
      ? `+${formatNumber(stats.changePercentage24h, 2)}%` 
      : `${formatNumber(stats.changePercentage24h, 2)}%`;
    
    const changeEmoji = stats.changePercentage24h > 0 
      ? '📈' 
      : stats.changePercentage24h < 0 
        ? '📉' 
        : '➖';
    
    return `
<b>🏦 Wallet Overview</b>

<b>Total Value:</b> $${formatNumber(stats.totalValue, 2)}
<b>24h Change:</b> ${changeEmoji} ${changeStr}
<b>Tokens:</b> ${stats.tokenCount}
<b>Last Updated:</b> ${stats.lastUpdated.toLocaleTimeString()}
`;
  }

  /**
   * Format token stats for display
   * @param stats Token statistics
   * @returns Formatted string
   */
  formatTokenStats(stats: TokenStats): string {
    const changeStr = stats.priceChange24h > 0 
      ? `+${formatNumber(stats.priceChange24h, 2)}%` 
      : `${formatNumber(stats.priceChange24h, 2)}%`;
    
    const changeEmoji = stats.priceChange24h > 0 
      ? '📈' 
      : stats.priceChange24h < 0 
        ? '📉' 
        : '➖';
    
    return `
<b>${stats.name} (${stats.symbol})</b>

<b>Balance:</b> ${formatNumber(stats.balance, 6)} ${stats.symbol}
<b>Value:</b> $${formatNumber(stats.value, 2)}
<b>Price:</b> $${formatNumber(stats.price, 6)}
<b>24h Change:</b> ${changeEmoji} ${changeStr}
<b>Last Updated:</b> ${stats.lastUpdated.toLocaleTimeString()}
`;
  }

  /**
   * Get a summary of the top tokens by value
   * @param walletAddress The wallet address to check
   * @param limit Maximum number of tokens to include
   * @returns Formatted string
   */
  async getTopTokensSummary(walletAddress: string, limit: number = 5): Promise<string> {
    const tokenStats = await this.getTokenStats(walletAddress);
    
    // Sort by value (highest first)
    const sortedStats = [...tokenStats].sort((a, b) => b.value - a.value);
    
    // Take only the top tokens
    const topTokens = sortedStats.slice(0, limit);
    
    if (topTokens.length === 0) {
      return 'No tokens found in this wallet.';
    }
    
    let summary = '<b>Top Tokens:</b>\n';
    
    for (const token of topTokens) {
      const changeStr = token.priceChange24h > 0 
        ? `+${formatNumber(token.priceChange24h, 2)}%` 
        : `${formatNumber(token.priceChange24h, 2)}%`;
      
      const changeEmoji = token.priceChange24h > 0 
        ? '📈' 
        : token.priceChange24h < 0 
          ? '📉' 
          : '';
      
      summary += `• <b>${token.symbol}</b>: ${formatNumber(token.balance, 4)} ($${formatNumber(token.value, 2)}) ${changeEmoji}\n`;
    }
    
    return summary;
  }
}
