import TelegramBot, { EditMessageTextOptions } from 'node-telegram-bot-api';
import { SwapType, WalletWithUsers } from './swap-types';
import { PublicKey } from '@solana/web3.js';

export enum TransactionType {
  SWAP = 'swap',
  TRANSFER = 'transfer',
  STAKE = 'stake',
  UNSTAKE = 'unstake',
  MINT = 'mint',
  BURN = 'burn'
}

export enum WalletWatcherEvent {
  CREATE = 'create',
  DELETE = 'delete',
  INITIAL = 'initial',
  UPDATE = 'update'
}

export interface TokenTransfer {
  tokenInSymbol: string;
  tokenOutSymbol: string;
  tokenInMint: string;
  tokenOutMint: string;
  tokenAmountIn: string;
  tokenAmountOut: string;
}

export interface NativeParserInterface {
  platform: SwapType;
  owner: string;
  description: string;
  type: TransactionType | undefined;
  balanceChange: string | number | undefined;
  signature: string;
  swappedTokenMc: number | null | undefined;
  swappedTokenPrice: number | null | undefined;
  solPrice: string;
  currentHoldingPrice: string;
  currenHoldingPercentage: string;
  isNew: boolean;
  tokenTransfers: TokenTransfer[];
}

export interface CreateUserInterface {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  createdAt?: Date;
  settings?: {
    language?: string;
    notifications?: boolean;
    timezone?: string;
  };
}

export interface CreateUserGroupInterface {
  id: string;
  name: string;
  userId: string;
  createdAt?: Date;
  maxMembers?: number;
  settings?: {
    notifications?: boolean;
    autoAccept?: boolean;
    minWalletAge?: number;
  };
}

export interface ParsedTxInfo {
  info: {
    amount: string;
    authority: string;
    destination: string;
    source: string;
    timestamp?: number;
    fee?: number;
    status?: 'success' | 'error' | 'pending';
  };
  type: TransactionType;
}

export interface UserGroup {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  createdAt: Date;
  settings: {
    notifications: boolean;
    autoAccept: boolean;
    minWalletAge: number;
  };
}

export interface TxPerSecondCapInterface {
  wallet: WalletWithUsers;
  bot: TelegramBot;
  walletData: {
    count: number;
    startTime: number;
    lastUpdate?: number;
  };
  excludedWallets: Map<string, boolean>;
  maxTxPerSecond?: number;
  cooldownPeriod?: number;
}

export interface SetupWalletWatcherProps {
  userId?: string | null;
  walletId?: string | null;
  event: WalletWatcherEvent;
  options?: {
    immediate?: boolean;
    retryAttempts?: number;
    notifyOwner?: boolean;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validatePublicKey(key: string): ValidationResult {
  try {
    new PublicKey(key);
    return { isValid: true, errors: [] };
  } catch (error) {
    return {
      isValid: false,
      errors: ['Invalid public key format']
    };
  }
}

export function validateUserGroup(group: Partial<UserGroup>): ValidationResult {
  const errors: string[] = [];

  if (!group.name?.trim()) {
    errors.push('Group name is required');
  }

  if (!group.ownerId?.trim()) {
    errors.push('Owner ID is required');
  }

  if (group.members && !Array.isArray(group.members)) {
    errors.push('Members must be an array');
  }

  if (group.settings) {
    if (typeof group.settings.notifications !== 'boolean') {
      errors.push('Notifications setting must be a boolean');
    }

    if (typeof group.settings.autoAccept !== 'boolean') {
      errors.push('AutoAccept setting must be a boolean');
    }

    if (typeof group.settings.minWalletAge !== 'number' || group.settings.minWalletAge < 0) {
      errors.push('MinWalletAge must be a non-negative number');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateUser(user: Partial<CreateUserInterface>): ValidationResult {
  const errors: string[] = [];

  if (!user.id?.trim()) {
    errors.push('User ID is required');
  }

  if (!user.username?.trim()) {
    errors.push('Username is required');
  }

  if (!user.firstName?.trim()) {
    errors.push('First name is required');
  }

  if (user.settings) {
    if (user.settings.language && typeof user.settings.language !== 'string') {
      errors.push('Language setting must be a string');
    }

    if (user.settings.notifications !== undefined && typeof user.settings.notifications !== 'boolean') {
      errors.push('Notifications setting must be a boolean');
    }

    if (user.settings.timezone && typeof user.settings.timezone !== 'string') {
      errors.push('Timezone setting must be a string');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
