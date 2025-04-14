import { Connection, Keypair, PublicKey, Account } from '@solana/web3.js';
import BN from 'bn.js';
import {
  MangoClient,
  MangoGroup,
  MangoAccount,
  PerpMarket,
  Config,
} from '@blockworks-foundation/mango-client';
import { LeveragePosition } from '../../types/trading-types';

// Define interface for perp position data
interface PerpPositionInfo {
  basePosition: number;
  avgEntryPrice?: number;
  quotePosition?: BN;
}

// Extend MangoAccount with the properties we need
type ExtendedMangoAccount = MangoAccount & {
  perpPositions?: PerpPositionInfo[];
  getCollateralValue?: () => number;
}

// Extend MangoGroup with the properties we need
type ExtendedMangoGroup = MangoGroup & {
  dexProgramId: PublicKey;
}

// Extend PerpMarket with the properties we need
type ExtendedPerpMarket = PerpMarket & {
  price: number;
}

// Extend MangoClient with the properties we need
type ExtendedMangoClient = MangoClient & {
  getMangoAccount(
    connection: Connection,
    publicKey: PublicKey,
    dexProgramId: PublicKey,
  ): Promise<ExtendedMangoAccount>;
  
  initMangoAccount(
    group: ExtendedMangoGroup,
    owner: Account,
  ): Promise<string>;

  placeOrder(
    connection: Connection,
    programId: PublicKey,
    group: ExtendedMangoGroup,
    mangoAccount: ExtendedMangoAccount,
    perpMarket: ExtendedPerpMarket,
    owner: Account,
    side: 'buy' | 'sell',
    price: number,
    size: number,
  ): Promise<string>;

  getRootBanks(
    connection: Connection,
    group: ExtendedMangoGroup,
  ): Promise<any>;

  getMangoGroup(
    connection: Connection,
    mangoGroupPk: PublicKey,
  ): Promise<ExtendedMangoGroup>;

  getPerpMarket(
    connection: Connection,
    publicKey: PublicKey,
  ): Promise<ExtendedPerpMarket>;
}

export class MangoService {
  private connection: Connection;
  private client: ExtendedMangoClient;
  private group: ExtendedMangoGroup | null = null;
  private cache: any | null = null;
  private config: Config;

  constructor(connection: Connection) {
    this.connection = connection;
    this.config = Config.ids();
    const group = this.config.getGroup('mainnet', 'mainnet.1');
    if (!group) {
      throw new Error('Group not found');
    }
    this.client = new MangoClient(this.connection, group.mangoProgramId) as ExtendedMangoClient;
  }

  private async initializeGroup(): Promise<void> {
    if (!this.group || !this.cache) {
      const group = this.config.getGroup('mainnet', 'mainnet.1');
      if (!group) {
        throw new Error('Group not found');
      }
      this.group = await this.client.getMangoGroup(
        this.connection,
        group.publicKey,
      ) as ExtendedMangoGroup;
      this.cache = await this.client.getRootBanks(this.connection, this.group);
    }
  }

  private keypairToAccount(keypair: Keypair): Account {
    return new Account(keypair.secretKey);
  }

  async getPosition(
    wallet: PublicKey,
    market: string,
  ): Promise<LeveragePosition | null> {
    await this.initializeGroup();
    if (!this.group || !this.cache) throw new Error('Group not initialized');

    try {
      const group = this.config.getGroup('mainnet', 'mainnet.1');
      if (!group) {
        throw new Error('Group not found');
      }

      const perpMarket = await this.client.getPerpMarket(
        this.connection,
        group.publicKey,
      );

      const mangoAccount = await this.client.getMangoAccount(
        this.connection,
        wallet,
        this.group.dexProgramId,
      );

      if (!mangoAccount) {
        return null;
      }

      // Get position info
      const position = mangoAccount.perpPositions?.[0];
      if (!position) {
        return null;
      }

      // Calculate current price and leverage
      const currentPrice = perpMarket.price;
      const leverage = this.calculateLeverage(position, mangoAccount, perpMarket);
      const unrealizedPnl = this.calculateUnrealizedPnl(position, currentPrice);
      const liquidationPrice = this.calculateLiquidationPrice(position, mangoAccount, perpMarket);

      return {
        market,
        size: position.basePosition,
        side: position.basePosition > 0 ? 'long' : 'short',
        entryPrice: position.avgEntryPrice || 0,
        currentPrice,
        leverage,
        unrealizedPnl,
        liquidationPrice,
      };
    } catch (error) {
      console.error('Error getting position:', error);
      return null;
    }
  }

  async openLeveragePosition(
    wallet: Keypair,
    market: string,
    size: number,
    isLong: boolean,
    leverage: number = 1,
  ): Promise<string> {
    await this.initializeGroup();
    if (!this.group || !this.cache) throw new Error('Group not initialized');

    try {
      const group = this.config.getGroup('mainnet', 'mainnet.1');
      if (!group) {
        throw new Error('Group not found');
      }

      const perpMarket = await this.client.getPerpMarket(
        this.connection,
        group.publicKey,
      );

      // Get or create mango account
      const walletAccount = this.keypairToAccount(wallet);
      let mangoAccount: ExtendedMangoAccount;
      try {
        mangoAccount = await this.client.getMangoAccount(
          this.connection,
          walletAccount.publicKey,
          this.group.dexProgramId,
        );
      } catch (e) {
        // Create new account if it doesn't exist
        const tx = await this.client.initMangoAccount(
          this.group,
          walletAccount,
        );
        const { blockhash } = await this.connection.getLatestBlockhash();
        await this.connection.confirmTransaction({
          signature: tx,
          blockhash,
          lastValidBlockHeight: await this.connection.getBlockHeight(),
        });
        mangoAccount = await this.client.getMangoAccount(
          this.connection,
          walletAccount.publicKey,
          this.group.dexProgramId,
        );
      }

      // Calculate position size based on leverage
      const price = perpMarket.price;
      const adjustedSize = size * leverage;
      const side = isLong ? 'buy' : 'sell';

      // Place the perp order
      const tx = await this.client.placeOrder(
        this.connection,
        this.group.dexProgramId,
        this.group,
        mangoAccount,
        perpMarket,
        walletAccount,
        side,
        price,
        adjustedSize,
      );

      return tx;
    } catch (error) {
      console.error('Error opening leverage position:', error);
      throw error;
    }
  }

  async closeLeveragePosition(
    wallet: Keypair,
    market: string,
    position: LeveragePosition,
  ): Promise<string> {
    await this.initializeGroup();
    if (!this.group || !this.cache) throw new Error('Group not initialized');

    try {
      const group = this.config.getGroup('mainnet', 'mainnet.1');
      if (!group) {
        throw new Error('Group not found');
      }

      const perpMarket = await this.client.getPerpMarket(
        this.connection,
        group.publicKey,
      );

      const walletAccount = this.keypairToAccount(wallet);
      const mangoAccount = await this.client.getMangoAccount(
        this.connection,
        walletAccount.publicKey,
        this.group.dexProgramId,
      );

      const side = position.side === 'long' ? 'sell' : 'buy';
      const price = perpMarket.price;

      const tx = await this.client.placeOrder(
        this.connection,
        this.group.dexProgramId,
        this.group,
        mangoAccount,
        perpMarket,
        walletAccount,
        side,
        price,
        Math.abs(position.size),
      );

      return tx;
    } catch (error) {
      console.error('Error closing leverage position:', error);
      throw error;
    }
  }

  private calculateEntryPrice(perpPosition: PerpPositionInfo): number {
    return perpPosition.avgEntryPrice || 0;
  }

  private calculateLeverage(
    perpPosition: PerpPositionInfo,
    mangoAccount: ExtendedMangoAccount,
    market: ExtendedPerpMarket,
  ): number {
    if (!perpPosition.quotePosition) return 0;
    const quoteValue = perpPosition.quotePosition.toNumber();
    const collateralValue = mangoAccount.getCollateralValue?.() || 0;
    return collateralValue === 0 ? 0 : quoteValue / collateralValue;
  }

  private calculateUnrealizedPnl(
    perpPosition: PerpPositionInfo,
    currentPrice: number,
  ): number {
    if (!perpPosition.quotePosition) return 0;
    const entryPrice = this.calculateEntryPrice(perpPosition);
    const basePos = perpPosition.basePosition;
    return (currentPrice - entryPrice) * basePos;
  }

  private calculateLiquidationPrice(
    perpPosition: PerpPositionInfo,
    mangoAccount: ExtendedMangoAccount,
    market: ExtendedPerpMarket,
  ): number {
    return 0;
  }
}
