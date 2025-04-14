import { PublicKey } from '@solana/web3.js';

export enum StrategyType {
  RSI_MACD = 'RSI_MACD',
  SMART_BUY = 'SMART_BUY',
  TREND_FOLLOWING = 'TREND_FOLLOWING',
  MEAN_REVERSION = 'MEAN_REVERSION'
}

export enum TimeFrame {
  M1 = '1m',
  M5 = '5m',
  M15 = '15m',
  M30 = '30m',
  H1 = '1h',
  H4 = '4h',
  D1 = '1d',
  W1 = '1w'
}

export interface TradeConfig {
  userId: string;
  tokenAddress: string;
  amount: number;
  price?: number;
  slippage?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  isLong?: boolean;
  walletSecretKey?: string;
  strategy?: string;
  walletAddress?: string;
  walletType?: 'phantom' | 'bot_generated';
  fundAllocation?: {
    purpose: 'trade' | 'leverage' | 'liquidity';
    amount: number;
  };
}

export interface SmartTradeConfig extends TradeConfig {
  strategyType: StrategyType;
  timeframe: TimeFrame;
  indicators: {
    rsi?: {
      period: number;
      overbought: number;
      oversold: number;
    };
    macd?: {
      fastPeriod: number;
      slowPeriod: number;
      signalPeriod: number;
      threshold: number;
    };
    bollinger?: {
      period: number;
      standardDeviations: number;
      threshold: number;
    };
  };
  autoLiquidity?: {
    enabled: boolean;
    minLiquidity: number;
    maxSlippage: number;
  };
}

export interface LeveragePosition {
  market: string;
  size: number;
  side: 'long' | 'short';
  leverage: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  liquidationPrice: number;
}

export interface TradingStrategy {
  readonly name: string;
  readonly description: string;
  readonly riskLevel: 'low' | 'medium' | 'high';

  evaluateConditions(config: SmartTradeConfig): Promise<{
    shouldEnter: boolean;
    confidence: number;
    reasons: string[];
  }>;

  calculateEntryPrice(config: SmartTradeConfig): Promise<{
    price: number;
    confidence: number;
    validUntil: Date;
  }>;

  calculateExitPrice(config: SmartTradeConfig): Promise<{
    price: number;
    type: 'stopLoss' | 'takeProfit' | 'trailing';
    reason: string;
  }>;
}

export interface TradeValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface TradingStats {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  profitLoss: number;
  lastUpdated: Date;
}

export interface PriceData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorValues {
  rsi?: number[];
  macd?: {
    macdLine: number[];
    signalLine: number[];
    histogram: number[];
  };
  bollinger?: {
    upper: number[];
    middle: number[];
    lower: number[];
  };
  volume?: {
    value: number[];
    sma: number[];
  };
}

export interface ChartData {
  symbol: string;
  timeframe: TimeFrame;
  prices: PriceData[];
  indicators?: IndicatorValues;
  metadata?: {
    lastUpdate: number;
    source: string;
    reliability: number;
  };
}

export interface Trade {
  type: 'BUY' | 'SELL';
  symbol: string;
  price: number;
  amount: number;
  status: string;
}

export function validateTradeConfig(config: TradeConfig): TradeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!config.userId) errors.push('User ID is required');
  if (!config.tokenAddress) {
    errors.push('Token address is required');
  } else {
    try {
      new PublicKey(config.tokenAddress);
    } catch {
      errors.push('Invalid token address format');
    }
  }

  // Amount validation
  if (!config.amount || config.amount <= 0) {
    errors.push('Amount must be greater than 0');
  }

  // Optional fields validation
  if (config.slippage !== undefined) {
    if (config.slippage < 0 || config.slippage > 100) {
      errors.push('Slippage must be between 0 and 100');
    } else if (config.slippage > 5) {
      warnings.push('High slippage tolerance detected');
    }
  }

  if (config.leverage !== undefined) {
    if (config.leverage < 1) {
      errors.push('Leverage must be at least 1x');
    } else if (config.leverage > 10) {
      warnings.push('High leverage detected');
    }
  }

  if (config.stopLoss !== undefined && config.price !== undefined) {
    const stopLossPercent = Math.abs((config.stopLoss - config.price) / config.price * 100);
    if (stopLossPercent < 1) {
      warnings.push('Stop loss is very close to entry price');
    }
  }

  if (config.takeProfit !== undefined && config.price !== undefined) {
    const takeProfitPercent = Math.abs((config.takeProfit - config.price) / config.price * 100);
    if (takeProfitPercent < 2) {
      warnings.push('Take profit is very close to entry price');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
