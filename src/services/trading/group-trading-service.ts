import { Connection, PublicKey, VersionedTransaction, TransactionMessage, TransactionInstruction } from '@solana/web3.js';
import { Redis } from 'ioredis';
import { CircuitBreaker } from '../circuit-breaker/circuit-breaker';
import { GroupTrade, ExitType } from '../../types/group-trading-types';
import { TelegramAlert } from '../../services/monitoring/telegram-alert';
import { JupiterProvider } from '../providers/jupiter-provider';
import { PhantomService } from '../wallet/phantom-service';
import { v4 as uuidv4 } from 'uuid';
import { retry } from '../../utils/retry';

export class GroupTradingService {
  private readonly connection: Connection;
  private readonly redis: Redis;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly telegramAlert: TelegramAlert;
  private readonly jupiterProvider: JupiterProvider;
  private readonly phantomService: PhantomService;

  constructor(
    connection: Connection,
    redis: Redis,
    circuitBreaker: CircuitBreaker,
    telegramAlert: TelegramAlert,
    jupiterProvider: JupiterProvider,
    phantomService: PhantomService
  ) {
    this.connection = connection;
    this.redis = redis;
    this.circuitBreaker = circuitBreaker;
    this.telegramAlert = telegramAlert;
    this.jupiterProvider = jupiterProvider;
    this.phantomService = phantomService;
  }

  getConnection(): Connection {
    return this.connection;
  }

  async createTrade(
    groupId: string,
    creatorId: string,
    tokenAddress: string,
    tokenSymbol: string,
    params: Partial<GroupTrade>
  ): Promise<GroupTrade> {
    const tradeId = uuidv4();
    
    const trade: GroupTrade = {
      id: tradeId,
      groupId,
      tokenAddress,
      tokenSymbol,
      createdBy: creatorId,
      exitType: params.exitType || ExitType.DEMOCRATIC,
      minParticipants: params.minParticipants || 3,
      maxParticipants: params.maxParticipants || 10,
      minEntry: params.minEntry || 0.1,
      maxEntry: params.maxEntry || 5,
      maxSlippage: params.maxSlippage || 1,
      deadline: Date.now() + (params.deadline || 300000), // 5 min default
      status: 'pending',
      participants: [],
      totalAmount: 0,
      profitTarget: params.profitTarget,
      stopLoss: params.stopLoss,
      threadId: params.threadId
    };

    await this.redis.set(`trade:${tradeId}`, JSON.stringify(trade));
    await this.redis.expire(`trade:${tradeId}`, 3600); // 1 hour TTL

    return trade;
  }

  async joinTrade(
    tradeId: string,
    userId: string,
    walletAddress: string,
    amount: number
  ): Promise<boolean> {
    return retry(async () => {
      const trade = await this.getTrade(tradeId);
      if (!trade || trade.status !== 'pending') {
        throw new Error('Trade not available');
      }

      if (amount < trade.minEntry || amount > trade.maxEntry) {
        throw new Error(`Amount must be between ${trade.minEntry} and ${trade.maxEntry} SOL`);
      }

      if (trade.participants.length >= trade.maxParticipants) {
        throw new Error('Trade pool is full');
      }

      // Verify wallet balance with retry
      const balance = await retry(
        () => this.connection.getBalance(new PublicKey(walletAddress)),
        3,  // maxAttempts
        2000 // delay
      );

      if (balance < amount * 1e9) { // Convert SOL to lamports
        throw new Error('Insufficient balance');
      }

      // Add participant
      trade.participants.push({
        userId,
        walletAddress,
        amount,
        joinedAt: Date.now()
      });

      trade.totalAmount += amount;

      // Update trade
      await this.redis.set(`trade:${tradeId}`, JSON.stringify(trade));

      // Check if we should execute
      if (trade.participants.length >= trade.minParticipants) {
        await this.executeTrade(trade);
        return true;
      }

      return false;
    }, 3, 1000);
  }

  async executeTrade(trade: GroupTrade): Promise<void> {
    const tradeId = trade.id || uuidv4();
    trade.id = tradeId;

    try {
      // Verify wallet balance
      const walletAddress = trade.participants[0].walletAddress;
      
      // Verify wallet balance with retry
      const balance = await retry(
        async () => this.connection.getBalance(new PublicKey(walletAddress)),
        3,  // maxAttempts
        2000 // delay
      );

      if (balance < trade.totalAmount * 1e9) { // Convert SOL to lamports
        throw new Error(`Insufficient balance: ${balance / 1e9} SOL`);
      }

      // Get best route with retry
      const route = await retry(
        async () => this.jupiterProvider.getBestRoute(
          trade.tokenAddress,
          'SOL',  // assuming SOL as output mint
          trade.totalAmount * 1e9,  // Convert SOL to lamports
          trade.maxSlippage || 1
        ),
        5,  // maxAttempts
        2000 // delay
      );

      // Create transaction
      const transaction = await this.createBulkTransaction(trade, route.instructions);

      // Execute trade with retry
      const signature = await retry(
        async () => this.executeTradeTransaction(trade, transaction),
        3,  // maxAttempts
        1000 // delay
      );

      // Update trade status
      await retry(
        async () => {
          await this.redis.hset(
            `trade:${trade.id}`,
            'status',
            'executed',
            'signature',
            signature
          );
        },
        3,  // maxAttempts
        1000 // delay
      );

      // Notify participants
      await this.telegramAlert.sendGroupAlert(trade.groupId, `Trade executed successfully! Signature: ${signature}`);
    } catch (error) {
      // Handle error
      if (error instanceof Error) {
        await this.telegramAlert.sendGroupAlert(trade.groupId, `Trade failed: ${error.message}`);
      }
      throw error;
    }
  }

  async executeTradeTransaction(
    trade: GroupTrade,
    transaction: VersionedTransaction
  ): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      try {
        // Send transaction
        const signature = await retry<string>(
          () => this.connection.sendTransaction(transaction),
          3,  // maxAttempts
          1000 // delay
        );

        // Update trade status
        await retry(
          async () => {
            await this.redis.hset(
              `trade:${trade.id}`,
              'status',
              'executed',
              'signature',
              signature
            );
          },
          3,  // maxAttempts
          1000 // delay
        );

        // Notify participants
        await this.telegramAlert.sendGroupAlert(
          trade.groupId,
          `Trade completed! Signature: ${signature}`
        );

        return signature;
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error executing group trade:', error.message);
        }
        trade.status = 'cancelled';
        await this.redis.set(`trade:${trade.id}`, JSON.stringify(trade));
        throw error;
      }
    });
  }

  async initiateExit(tradeId: string, userId: string): Promise<void> {
    const trade = await this.getTrade(tradeId);
    if (!trade || trade.status !== 'active') return;

    const voteKey = `vote:${tradeId}:${userId}`;
    await this.redis.set(voteKey, 'exit');
    await this.redis.expire(voteKey, 3600);

    // Count votes
    const votes = await this.countExitVotes(tradeId);
    const requiredVotes = Math.ceil(trade.participants.length * 0.66); // 66% majority

    if (votes >= requiredVotes || trade.exitType === ExitType.ADMIN) {
      await this.executeExit(tradeId);
    }
  }

  async getTrade(tradeId: string): Promise<GroupTrade | null> {
    const trade = await this.redis.get(`trade:${tradeId}`);
    if (!trade) return null;
    return JSON.parse(trade);
  }

  private async createBulkTransaction(
    trade: GroupTrade,
    instructions: TransactionInstruction[]
  ): Promise<VersionedTransaction> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
    
    // Create a message
    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(trade.participants[0].walletAddress),
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();

    // Create a versioned transaction
    const transaction = new VersionedTransaction(messageV0);

    return transaction;
  }

  private async notifyTradeExecution(
    trade: GroupTrade,
    signature: string
  ): Promise<void> {
    const message = `Trade executed for ${trade.tokenSymbol}\nSignature: ${signature}`;
    await this.telegramAlert.sendGroupAlert(trade.groupId, message);
  }

  private async countExitVotes(tradeId: string): Promise<number> {
    const keys = await this.redis.keys(`vote:${tradeId}:*`);
    return keys.length;
  }

  private async executeExit(tradeId: string): Promise<void> {
    // Implementation for executing group exit
  }

  async getTradesByGroup(groupId: string): Promise<GroupTrade[]> {
    const pattern = `trade:*`;
    const keys = await this.redis.keys(pattern);
    
    const trades = await Promise.all(
      keys.map(async key => {
        const trade = await this.getTrade(key.split(':')[1]);
        return trade && trade.groupId === groupId ? trade : null;
      })
    );

    return trades.filter(Boolean) as GroupTrade[];
  }
}
