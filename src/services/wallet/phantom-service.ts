import { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Redis } from 'ioredis';
import QRCode from 'qrcode';

export class PhantomService {
  private connection: Connection;
  private redis: Redis;
  private readonly DEEP_LINK_URL = 'https://phantom.app/ul/browse/';

  constructor(connection: Connection) {
    this.connection = connection;
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;
    
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: redisPort,
      password: process.env.REDIS_PASSWORD
    });
  }

  async generateConnectionQR(userId: string): Promise<string> {
    try {
      // Generate a unique session ID for this connection attempt
      const sessionId = `phantom:${userId}:${Date.now()}`;
      
      // Create the deep link URL with callback
      const callbackUrl = `${process.env.BOT_WEBHOOK_URL}/phantom/callback`;
      const deepLink = `${this.DEEP_LINK_URL}?dapp=${encodeURIComponent(callbackUrl)}&sessionId=${sessionId}`;
      
      // Store the session ID in Redis with expiration
      await this.redis.setex(`phantom:session:${sessionId}`, 3600, userId);
      
      // Generate QR code
      const qrCodeDataUrl = await QRCode.toDataURL(deepLink);
      return qrCodeDataUrl;
    } catch (error) {
      console.error('Error generating Phantom QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  async verifyConnection(userId: string, walletAddress: string): Promise<boolean> {
    try {
      // Verify the wallet exists on Solana
      const publicKey = new PublicKey(walletAddress);
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      
      if (!accountInfo) {
        console.error('Wallet not found on Solana:', walletAddress);
        return false;
      }

      // Store the verified wallet in Redis
      await this.redis.set(`user:${userId}:phantom`, walletAddress);
      return true;
    } catch (error) {
      console.error('Error verifying wallet connection:', error);
      return false;
    }
  }

  async getWalletAddress(userId: number): Promise<string | null> {
    try {
      const walletAddress = await this.redis.get(`user:${userId}:phantom`);
      return walletAddress;
    } catch (error) {
      console.error('Error fetching wallet address:', error);
      return null;
    }
  }

  async signTransaction(
    walletAddress: string,
    transaction: Transaction
  ): Promise<Transaction> {
    try {
      // Get the stored session for this wallet
      const userId = await this.redis.get(`wallet:${walletAddress}:user`);
      if (!userId) {
        throw new Error('No active session found for wallet');
      }

      // Store the transaction in Redis for signing
      const txId = `tx:${Date.now()}:${walletAddress}`;
      await this.redis.setex(txId, 300, transaction.serialize().toString('base64'));

      // Return the transaction for later verification
      return transaction;
    } catch (error) {
      console.error('Error requesting transaction signature:', error);
      throw error;
    }
  }

  async getWalletBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting balance:', error);
      return 0;
    }
  }
}
