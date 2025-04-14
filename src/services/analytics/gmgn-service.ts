import { Collection, Data, Metadata, TokenStandard, Uses } from '@metaplex-foundation/mpl-token-metadata'
import axios from 'axios';
import { Redis } from 'ioredis';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

export interface HolderAnalysis {
  totalHolders: number;
  newHolders24h: number;
  holderDistribution: {
    whales: number;    // >1% supply
    medium: number;    // 0.1-1% supply
    retail: number;    // <0.1% supply
  };
  averageHoldTime: number;
  holderQuality: number;  // 0-100 score
}

interface TraderProfile {
  address: string
  successRate: number
  avgROI: number
  totalTrades: number
  recentTokens: string[]
  lastActive: Date
}

export class GmgnService {
  private connection: Connection
  private redis: Redis
  private readonly CACHE_TTL = 300 // 5 minutes

  constructor(connection: Connection) {
    this.connection = connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    })
  }

  async analyzeHolders(tokenAddress: string): Promise<HolderAnalysis> {
    const cacheKey = `holder_analysis:${tokenAddress}`
    
    // Try cache first
    const cached = await this.redis.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }

    try {
      // Get holder data from GMGN API
      const response = await axios.get(
        `${process.env.GMGN_API_URL}/holders/${tokenAddress}`,
        process.env.GMGN_API_KEY ? {
          headers: { 'Authorization': `Bearer ${process.env.GMGN_API_KEY}` }
        } : undefined
      );

      const analysis = response.data;
      
      // Cache the result
      await this.redis.set(cacheKey, JSON.stringify(analysis), 'EX', this.CACHE_TTL);
      
      return analysis;
    } catch (error) {
      console.error('Error analyzing holders:', error);
      throw error;
    }
  }

  private processHolderData(holders: any[]): HolderAnalysis {
    const totalSupply = holders.reduce((sum, h) => sum + h.balance, 0);
    
    const distribution = {
      whales: 0,
      medium: 0,
      retail: 0
    };

    let totalHoldTime = 0;
    const now = new Date();

    holders.forEach(holder => {
      const percentage = (holder.balance / totalSupply) * 100;
      
      if (percentage > 1) distribution.whales++;
      else if (percentage > 0.1) distribution.medium++;
      else distribution.retail++;

      totalHoldTime += (now.getTime() - new Date(holder.firstBuy).getTime());
    });

    return {
      totalHolders: holders.length,
      newHolders24h: holders.filter(h => 
        new Date(h.firstBuy).getTime() > now.getTime() - 86400000
      ).length,
      holderDistribution: distribution,
      averageHoldTime: totalHoldTime / holders.length / (1000 * 60 * 60), // in hours
      holderQuality: this.calculateHolderQuality(holders)
    };
  }

  private calculateHolderQuality(holders: any[]): number {
    let score = 0;
    
    // Factor 1: Hold time distribution (30%)
    const holdTimeScore = this.calculateHoldTimeScore(holders);
    score += holdTimeScore * 0.3;
    
    // Factor 2: Balance distribution (30%)
    const distributionScore = this.calculateDistributionScore(holders);
    score += distributionScore * 0.3;
    
    // Factor 3: Holder behavior (40%)
    const behaviorScore = this.calculateBehaviorScore(holders);
    score += behaviorScore * 0.4;
    
    return Math.min(score, 100);
  }

  private calculateHoldTimeScore(holders: any[]): number {
    const now = new Date().getTime();
    const holdTimes = holders.map(h => now - new Date(h.firstBuy).getTime());
    
    const avgHoldTime = holdTimes.reduce((a, b) => a + b, 0) / holders.length;
    return Math.min((avgHoldTime / (7 * 24 * 60 * 60 * 1000)) * 100, 100); // Score based on average 7-day hold
  }

  private calculateDistributionScore(holders: any[]): number {
    const totalSupply = holders.reduce((sum, h) => sum + h.balance, 0);
    const gini = this.calculateGiniCoefficient(holders.map(h => h.balance));
    
    // Lower Gini coefficient (more equal distribution) = higher score
    return (1 - gini) * 100;
  }

  private calculateBehaviorScore(holders: any[]): number {
    let score = 0;
    const now = new Date().getTime();
    
    // Check for positive behaviors
    holders.forEach(holder => {
      // Regular buys
      if (holder.buyCount > 1) score += 10;
      
      // Long-term holding
      if (now - new Date(holder.firstBuy).getTime() > 30 * 24 * 60 * 60 * 1000) score += 20;
      
      // No panic sells
      if (!holder.hasPanicSold) score += 10;
    });
    
    return Math.min(score / holders.length, 100);
  }

  private calculateGiniCoefficient(values: number[]): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const count = sorted.length;
    const totalSum = sorted.reduce((sum, val) => sum + val, 0);
    
    let accumulator = 0;
    for (let i = 0; i < count; i++) {
      accumulator += sorted[i] * (count - i);
    }
    
    const gini = (count + 1 - 2 * (accumulator / totalSum)) / count;
    return Math.max(0, Math.min(1, gini));
  }

  // Historical trader tracking
  async trackSuccessfulTraders(tokenAddress: string): Promise<TraderProfile[]> {
    try {
      const response = await axios.get(
        `${process.env.GMGN_API_URL}/traders/${tokenAddress}`,
        process.env.GMGN_API_KEY ? {
          headers: { 'Authorization': `Bearer ${process.env.GMGN_API_KEY}` }
        } : undefined
      );

      const traders = response.data.traders;
      const profiles = await Promise.all(
        traders.map((trader: any) => this.buildTraderProfile(trader))
      );

      // Cache successful traders
      await this.cacheSuccessfulTraders(profiles);

      return profiles.filter((p: { successRate: number }) => p.successRate > 60);
    } catch (error) {
      console.error('Error tracking traders:', error);
      return [];
    }
  }

  private async buildTraderProfile(trader: any): Promise<TraderProfile> {
    const trades = await this.getTraderHistory(trader.address);
    
    const successfulTrades = trades.filter(t => t.roi > 0);
    const totalROI = trades.reduce((sum, t) => sum + t.roi, 0);
    
    return {
      address: trader.address,
      successRate: (successfulTrades.length / trades.length) * 100,
      avgROI: totalROI / trades.length,
      totalTrades: trades.length,
      recentTokens: trades.slice(0, 5).map(t => t.token),
      lastActive: new Date(trades[0]?.timestamp || Date.now())
    };
  }

  private async getTraderHistory(address: string): Promise<any[]> {
    const cacheKey = `trader_history:${address}`;
    
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get from GMGN API
    const response = await axios.get(
      `${process.env.GMGN_API_URL}/trader/${address}/history`,
      process.env.GMGN_API_KEY ? {
        headers: { 'Authorization': `Bearer ${process.env.GMGN_API_KEY}` }
      } : undefined
    );

    const history = response.data.trades;
    
    // Cache for 1 hour
    await this.redis.setex(cacheKey, 3600, JSON.stringify(history));
    
    return history;
  }

  private async cacheSuccessfulTraders(profiles: TraderProfile[]): Promise<void> {
    const successful = profiles.filter(p => p.successRate > 75);
    
    // Store in Redis as a sorted set by success rate
    const pipeline = this.redis.pipeline();
    
    successful.forEach(profile => {
      pipeline.zadd(
        'successful_traders',
        profile.successRate,
        profile.address
      );
    });

    await pipeline.exec();
  }
}
