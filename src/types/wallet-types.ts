import { WalletType } from '../services/wallet/wallet-service';
import { PublicKey } from '@solana/web3.js';

export interface WalletBalance {
  address: string;
  balance: number;
  type: WalletType;
}

export interface WalletPosition {
  walletAddress: string;
  positionId: string;
  tokenAddress: string;
  amount: number;
  entryPrice: number;
  currentPrice: number;
  type: 'trade' | 'leverage' | 'liquidity';
  status: 'active' | 'closed';
  pnl?: number;
}

export interface WalletAllocation {
  walletAddress: string;
  amount: number;
  type: WalletType;
  purpose: 'trade' | 'leverage' | 'liquidity';
  timestamp: Date;
}

export interface WalletSelectionOptions {
  minBalance?: number;
  walletType?: WalletType;
  excludeAddresses?: string[];
  preferredAddress?: string;
}

export interface WalletValidationResult {
  isValid: boolean;
  errors: string[];
  availableBalance?: number;
  requiredBalance?: number;
}