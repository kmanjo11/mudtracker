import { Connection, PublicKey } from '@solana/web3.js';
import { Market } from '@project-serum/serum';

interface PositionConfig {
  // Entry conditions
  entryTriggers: {
    rsi?: { value: number; condition: 'above' | 'below' };
    priceAction?: { value: number; condition: 'above' | 'below' };
    macdCrossover?: boolean;
    bollingerBand?: { position: 'upper' | 'lower' | 'middle' };
  };
  
  // Take profit levels
  takeProfitLevels: {
    level: number;      // Percentage gain
    size: number;       // Percentage of position to sell
    trailing?: boolean; // Whether to use trailing stop
  }[];
  
  // Stop loss configuration
  stopLoss: {
    initial: number;    // Initial stop loss percentage
    trailing?: boolean; // Whether to use trailing stop
    moveToBreakeven?: { // When to move stop loss to breakeven
      afterProfitPercent?: number;
      afterTimeMinutes?: number;
    };
  };
  
  // Position sizing
  maxPositionSize: number;     // Max % of portfolio per position
  scalingStrategy?: {
    entries: number;           // Number of entry points
    priceSpacing: number;      // % between entries
    sizeDistribution: number[]; // How to distribute size across entries
  };
}

export class PositionManager {
  private connection: Connection;
  private defaultConfig: PositionConfig = {
    entryTriggers: {
      rsi: { value: 30, condition: 'below' },
      macdCrossover: true,
      bollingerBand: { position: 'lower' }
    },
    takeProfitLevels: [
      { level: 10, size: 0.3, trailing: false },  // Take 30% off at 10% profit
      { level: 20, size: 0.3, trailing: true },   // Take another 30% at 20% with trailing
      { level: 50, size: 0.4, trailing: true }    // Rest at 50% with trailing
    ],
    stopLoss: {
      initial: -5,
      trailing: true,
      moveToBreakeven: {
        afterProfitPercent: 15
      }
    },
    maxPositionSize: 12 // Max 12% of portfolio per position
  };

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async evaluateEntry(
    market: Market,
    price: number,
    indicators: any,
    config: Partial<PositionConfig> = {}
  ): Promise<{
    shouldEnter: boolean;
    confidence: number;
    reason: string[];
  }> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const reasons: string[] = [];
    let confidenceScore = 0;
    
    // Check RSI
    if (mergedConfig.entryTriggers.rsi) {
      const { value, condition } = mergedConfig.entryTriggers.rsi;
      if (condition === 'below' && indicators.rsi <= value) {
        confidenceScore += 0.3;
        reasons.push(`RSI oversold (${indicators.rsi.toFixed(2)})`);
      }
    }

    // Check MACD crossover
    if (mergedConfig.entryTriggers.macdCrossover && 
        indicators.macd.histogram > 0 && 
        indicators.macd.previousHistogram < 0) {
      confidenceScore += 0.3;
      reasons.push('MACD bullish crossover');
    }

    // Check Bollinger Bands
    if (mergedConfig.entryTriggers.bollingerBand) {
      const { position } = mergedConfig.entryTriggers.bollingerBand;
      if (position === 'lower' && price <= indicators.bb.lower) {
        confidenceScore += 0.2;
        reasons.push('Price at lower Bollinger Band');
      }
    }

    // Volume confirmation
    if (indicators.volume > indicators.averageVolume * 1.5) {
      confidenceScore += 0.2;
      reasons.push('High volume confirmation');
    }

    return {
      shouldEnter: confidenceScore >= 0.6,
      confidence: confidenceScore,
      reason: reasons
    };
  }

  async managePosition(
    position: any,
    currentPrice: number,
    indicators: any,
    config: Partial<PositionConfig> = {}
  ): Promise<{
    action: 'hold' | 'exit' | 'partial_exit';
    size?: number;
    reason: string;
  }> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const { entryPrice, size } = position;
    const profitPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

    // Check stop loss
    if (profitPercent <= mergedConfig.stopLoss.initial) {
      return {
        action: 'exit',
        reason: `Stop loss hit at ${mergedConfig.stopLoss.initial}%`
      };
    }

    // Check breakeven stop move
    if (mergedConfig.stopLoss.moveToBreakeven?.afterProfitPercent && 
        profitPercent >= mergedConfig.stopLoss.moveToBreakeven.afterProfitPercent) {
      // Update stop loss to breakeven
      mergedConfig.stopLoss.initial = 0;
    }

    // Check take profit levels
    for (const tp of mergedConfig.takeProfitLevels) {
      if (profitPercent >= tp.level) {
        if (tp.trailing) {
          // Implement trailing stop logic
          const trailingStopDistance = profitPercent * 0.3; // 30% of current profit
          if (profitPercent - position.highestProfit >= trailingStopDistance) {
            return {
              action: 'partial_exit',
              size: tp.size,
              reason: `Trailing stop hit at ${profitPercent.toFixed(2)}%`
            };
          }
        } else {
          return {
            action: 'partial_exit',
            size: tp.size,
            reason: `Take profit target ${tp.level}% reached`
          };
        }
      }
    }

    // Update highest profit for trailing stops
    if (profitPercent > position.highestProfit) {
      position.highestProfit = profitPercent;
    }

    return {
      action: 'hold',
      reason: 'Position within parameters'
    };
  }

  calculatePositionSize(
    availableBalance: number,
    riskPercentage: number,
    stopLossPercent: number
  ): number {
    // Risk-based position sizing
    const riskAmount = availableBalance * (riskPercentage / 100);
    const positionSize = (riskAmount / Math.abs(stopLossPercent)) * 100;
    
    // Ensure we don't exceed max position size
    return Math.min(
      positionSize,
      availableBalance * (this.defaultConfig.maxPositionSize / 100)
    );
  }
}
