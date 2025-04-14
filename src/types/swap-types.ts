import { Prisma, User, Wallet, UserWallet } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';

export enum SwapPlatform {
  PUMPFUN = 'pumpfun',
  RAYDIUM = 'raydium',
  JUPITER = 'jupiter',
  MINT_PUMPFUN = 'mint_pumpfun'
}

export type SwapType = SwapPlatform | null;

export interface SwapConfig {
  platform: SwapPlatform;
  slippage: number;
  deadline?: number;
  minReceived?: string;
  priceImpact?: number;
}

export interface SwapRoute {
  inputMint: string;
  outputMint: string;
  amount: string;
  priceImpact: number;
  marketInfos: {
    id: string;
    label: string;
    inputMint: string;
    outputMint: string;
    notEnoughLiquidity: boolean;
    lpFee: {
      amount: number;
      mint: string;
      percent: number;
    };
  }[];
}

export interface SwapQuote {
  route: SwapRoute;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  priceImpactPct: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
}

export type WalletWithUsers = Prisma.WalletGetPayload<{
  include: {
    userWallets: {
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            hasDonated: true,
            botStatus: true,
            personalWalletPubKey: true,
            personalWalletPrivKey: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    }
  }
}>;

export interface WalletMetadata {
  address: string;
  label?: string;
  tags?: string[];
  riskScore?: number;
  lastActivity?: Date;
  totalVolume?: string;
}

export type WalletsToTrack = {
  address: string
  id: string
  metadata?: WalletMetadata
  userWallets: Array<{
    name: string
    userId: string
    walletId: string
    user: Pick<User, 'id' | 'username' | 'firstName' | 'lastName' | 'hasDonated' | 'botStatus' | 'personalWalletPubKey' | 'personalWalletPrivKey' | 'createdAt' | 'updatedAt'>
  }>
}

export interface UserWalletInfo {
  name: string;
  userId: string;
  walletId: string;
  user: Pick<User, 'id' | 'username' | 'firstName' | 'lastName' | 'hasDonated' | 'botStatus' | 'personalWalletPubKey' | 'personalWalletPrivKey' | 'createdAt' | 'updatedAt'>;
  notifications?: {
    enabled: boolean;
    types: ('swap' | 'transfer' | 'all')[];
    minAmount?: number;
  };
}

export interface WalletValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateWallet(wallet: Partial<WalletsToTrack>): WalletValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate address
  if (!wallet.address) {
    errors.push('Wallet address is required');
  } else {
    try {
      new PublicKey(wallet.address);
    } catch {
      errors.push('Invalid wallet address format');
    }
  }

  // Validate ID
  if (!wallet.id) {
    errors.push('Wallet ID is required');
  }

  // Validate user wallets
  if (!wallet.userWallets || !Array.isArray(wallet.userWallets)) {
    errors.push('User wallets must be an array');
  } else {
    wallet.userWallets.forEach((userWallet, index) => {
      if (!userWallet.name) {
        errors.push(`User wallet at index ${index} must have a name`);
      }
      if (!userWallet.userId) {
        errors.push(`User wallet at index ${index} must have a user ID`);
      }
      if (!userWallet.walletId) {
        errors.push(`User wallet at index ${index} must have a wallet ID`);
      }
      if (!userWallet.user?.id) {
        errors.push(`User wallet at index ${index} must have a valid user reference`);
      }
    });
  }

  // Validate metadata if present
  if (wallet.metadata) {
    if (wallet.metadata.riskScore !== undefined && 
        (wallet.metadata.riskScore < 0 || wallet.metadata.riskScore > 100)) {
      warnings.push('Risk score should be between 0 and 100');
    }

    if (wallet.metadata.tags && !Array.isArray(wallet.metadata.tags)) {
      errors.push('Metadata tags must be an array');
    }

    if (wallet.metadata.totalVolume) {
      const volume = parseFloat(wallet.metadata.totalVolume);
      if (isNaN(volume) || volume < 0) {
        errors.push('Total volume must be a valid non-negative number');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function validateSwapConfig(config: SwapConfig): WalletValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate platform
  if (!Object.values(SwapPlatform).includes(config.platform)) {
    errors.push('Invalid swap platform');
  }

  // Validate slippage
  if (typeof config.slippage !== 'number' || config.slippage < 0 || config.slippage > 100) {
    errors.push('Slippage must be between 0 and 100');
  } else if (config.slippage > 5) {
    warnings.push('High slippage tolerance detected');
  }

  // Validate deadline if present
  if (config.deadline !== undefined) {
    if (typeof config.deadline !== 'number' || config.deadline <= 0) {
      errors.push('Deadline must be a positive number');
    }
  }

  // Validate price impact if present
  if (config.priceImpact !== undefined) {
    if (typeof config.priceImpact !== 'number') {
      errors.push('Price impact must be a number');
    } else if (config.priceImpact > 10) {
      warnings.push('High price impact detected');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
