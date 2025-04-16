import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair } from '@solana/web3.js';
import axios from 'axios';
import { env } from '../../utils/env';
import { CircuitBreaker } from '../circuit-breaker/circuit-breaker';

interface JupiterQuoteParams {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  onlyDirectRoutes?: boolean;
}

interface JupiterSwapParams {
  userPublicKey: string;
  quoteResponse: any;
}

export class JupiterService {
  private readonly connection: Connection;
  private readonly JUPITER_API_URL = 'https://quote-api.jup.ag/v6';
  private readonly circuitBreaker: CircuitBreaker;

  constructor(connection: Connection) {
    this.connection = connection;
    this.circuitBreaker = new CircuitBreaker('jupiter', {
      failureThreshold: 3,
      resetTimeout: 60000,
      monitorInterval: 10000
    });
  }

  /**
   * Get a quote for swapping tokens
   * @param inputMint The mint address of the input token
   * @param outputMint The mint address of the output token
   * @param amount The amount of input tokens to swap (in lamports/smallest unit)
   * @param slippageBps The maximum slippage in basis points (1 bps = 0.01%)
   * @returns Quote response from Jupiter
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number = 50, // Default 0.5% slippage
    onlyDirectRoutes: boolean = false
  ): Promise<any> {
    return this.circuitBreaker.execute(async () => {
      try {
        const params: JupiterQuoteParams = {
          inputMint,
          outputMint,
          amount,
          slippageBps,
          onlyDirectRoutes
        };

        const response = await axios.get(`${this.JUPITER_API_URL}/quote`, { params });
        return response.data;
      } catch (error) {
        console.error('Error getting Jupiter quote:', error);
        throw new Error('Failed to get swap quote');
      }
    });
  }

  /**
   * Create a swap transaction
   * @param userPublicKey The public key of the user's wallet
   * @param quoteResponse The quote response from getQuote
   * @returns Transaction data for the swap
   */
  async createSwapTransaction(userPublicKey: string, quoteResponse: any): Promise<any> {
    return this.circuitBreaker.execute(async () => {
      try {
        const params: JupiterSwapParams = {
          userPublicKey,
          quoteResponse
        };

        const response = await axios.post(
          `${this.JUPITER_API_URL}/swap`,
          params
        );
        
        return response.data;
      } catch (error) {
        console.error('Error creating Jupiter swap transaction:', error);
        throw new Error('Failed to create swap transaction');
      }
    });
  }

  /**
   * Execute a token swap
   * @param wallet The keypair to sign the transaction
   * @param inputMint The mint address of the input token
   * @param outputMint The mint address of the output token
   * @param amount The amount of input tokens to swap (in lamports/smallest unit)
   * @param slippageBps The maximum slippage in basis points (1 bps = 0.01%)
   * @returns Transaction signature
   */
  async executeSwap(
    wallet: Keypair,
    inputMint: string,
    outputMint: string,
    amount: string,
    slippageBps: number = 50
  ): Promise<string> {
    try {
      // Get quote
      const quoteResponse = await this.getQuote(
        inputMint,
        outputMint,
        amount,
        slippageBps
      );

      // Create swap transaction
      const swapTransaction = await this.createSwapTransaction(
        wallet.publicKey.toString(),
        quoteResponse
      );

      // Deserialize and sign transaction
      const transaction = Transaction.from(
        Buffer.from(swapTransaction.swapTransaction, 'base64')
      );

      // Sign the transaction
      transaction.sign(wallet);

      // Send the transaction
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize()
      );

      // Confirm transaction
      await this.connection.confirmTransaction(signature, 'confirmed');

      return signature;
    } catch (error) {
      console.error('Error executing swap:', error);
      throw new Error('Failed to execute swap');
    }
  }

  /**
   * Get the price of a token in terms of another token
   * @param inputMint The mint address of the input token
   * @param outputMint The mint address of the output token
   * @returns The price of the input token in terms of the output token
   */
  async getPrice(inputMint: string, outputMint: string): Promise<number> {
    try {
      // Use a small amount for price check (1 token in smallest unit)
      const quoteResponse = await this.getQuote(
        inputMint,
        outputMint,
        '1000000' // 1 token with 6 decimals (like USDC)
      );

      // Calculate price from the quote
      const inputAmount = parseInt(quoteResponse.inputAmount);
      const outputAmount = parseInt(quoteResponse.outputAmount);
      
      return outputAmount / inputAmount;
    } catch (error) {
      console.error('Error getting price:', error);
      return 0;
    }
  }

  /**
   * Get the list of supported tokens
   * @returns List of supported tokens
   */
  async getSupportedTokens(): Promise<any[]> {
    return this.circuitBreaker.execute(async () => {
      try {
        const response = await axios.get(`${this.JUPITER_API_URL}/tokens`);
        return response.data;
      } catch (error) {
        console.error('Error getting supported tokens:', error);
        return [];
      }
    });
  }

  /**
   * Check if a token is supported by Jupiter
   * @param mintAddress The mint address of the token
   * @returns True if the token is supported, false otherwise
   */
  async isTokenSupported(mintAddress: string): Promise<boolean> {
    try {
      const tokens = await this.getSupportedTokens();
      return tokens.some(token => token.address === mintAddress);
    } catch (error) {
      console.error('Error checking token support:', error);
      return false;
    }
  }
}
