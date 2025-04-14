import * as TelegramBot from 'node-telegram-bot-api';
import { Context } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';

export interface Command {
  readonly name: string;
  readonly description: string;
  execute(ctx: Context<Update>): Promise<void>;
  handleCallback?(ctx: Context<Update>): Promise<void>;
}

export interface TradingStats {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  profitLoss: number;
  lastUpdated: Date;
}

export interface LiquidityPoolInfo {
  id: string;
  name: string;
  apr: number;
  tokenA: Token;
  tokenB: Token;
  totalLiquidity: number;
  userLiquidity?: number;
}

export interface Token {
  address: string;
  symbol: string;
  decimals: number;
  balance?: number;
}

export interface ChatConfig {
  chatId: number;
  type: 'group' | 'private' | 'channel' | 'supergroup';
  threadId?: number;
  features: {
    scanner: boolean;
  };
  adminIds: string[];
}

export interface RetryOptions {
  maxAttempts: number;
  backoffFactor: number;
  maxDelay: number;
  retryableErrors: (RegExp | string)[];
}

export interface UserSettings {
  userId: string;
  isActive: boolean;
  features: string[];
  preferences: Record<string, any>;
  lastUpdated: Date;
}

export interface WalletInfo {
  publicKey: string;
  secretKey: string | null;
  label?: string;
}
