import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import axios from 'axios';
import { CircuitBreaker } from '../circuit-breaker/circuit-breaker';

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  coingeckoId?: string;
  tags?: string[];
}

interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  price?: number;
  value?: number;
  logoURI?: string;
}

export class TokenService {
  private readonly connection: Connection;
  private readonly circuitBreaker: CircuitBreaker;
  private tokenList: TokenInfo[] = [];
  private lastTokenListUpdate: number = 0;
  private readonly TOKEN_LIST_TTL = 3600000; // 1 hour in milliseconds
  private readonly HELIUS_API_KEY: string;

  constructor(connection: Connection) {
    this.connection = connection;
    this.circuitBreaker = new CircuitBreaker('token-service', {
      failureThreshold: 3,
      resetTimeout: 60000,
      monitorInterval: 10000
    });
    this.HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
    this.loadTokenList();
  }

  /**
   * Load the Solana token list
   */
  private async loadTokenList(): Promise<void> {
    const now = Date.now();
    if (this.tokenList.length > 0 && now - this.lastTokenListUpdate < this.TOKEN_LIST_TTL) {
      return;
    }

    try {
      const response = await axios.get('https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json');
      this.tokenList = response.data.tokens;
      this.lastTokenListUpdate = now;
    } catch (error) {
      console.error('Error loading token list:', error);
      // If we failed to load the token list but have a cached version, keep using it
      if (this.tokenList.length === 0) {
        // Fallback to a minimal token list with just SOL and USDC
        this.tokenList = [
          {
            address: 'So11111111111111111111111111111111111111112',
            symbol: 'SOL',
            name: 'Wrapped SOL',
            decimals: 9
          },
          {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6
          }
        ];
      }
    }
  }

  /**
   * Get token information by mint address
   * @param mintAddress The mint address of the token
   * @returns Token information or null if not found
   */
  async getTokenInfo(mintAddress: string): Promise<TokenInfo | null> {
    await this.loadTokenList();
    
    const tokenInfo = this.tokenList.find(token => token.address === mintAddress);
    if (tokenInfo) {
      return tokenInfo;
    }
    
    // If not found in the token list, try to get it from the blockchain
    try {
      const publicKey = new PublicKey(mintAddress);
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      
      if (accountInfo && accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        // This is a token account, but we don't have metadata
        // Return minimal information
        return {
          address: mintAddress,
          symbol: 'Unknown',
          name: 'Unknown Token',
          decimals: 0 // We'll need to fetch this separately
        };
      }
    } catch (error) {
      console.error('Error getting token info from blockchain:', error);
    }
    
    return null;
  }

  /**
   * Get all token balances for a wallet
   * @param walletAddress The wallet address to check
   * @returns Array of token balances
   */
  async getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    return this.circuitBreaker.execute(async () => {
      try {
        await this.loadTokenList();
        
        const publicKey = new PublicKey(walletAddress);
        
        // Use Helius API to get token balances if API key is available
        if (this.HELIUS_API_KEY) {
          return this.getTokenBalancesFromHelius(walletAddress);
        }
        
        // Fallback to on-chain method
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );
        
        const balances: TokenBalance[] = [];
        
        for (const { account } of tokenAccounts.value) {
          const parsedInfo = account.data.parsed.info;
          const mintAddress = parsedInfo.mint;
          const amount = parsedInfo.tokenAmount.amount;
          const decimals = parsedInfo.tokenAmount.decimals;
          const uiAmount = parsedInfo.tokenAmount.uiAmount;
          
          // Skip tokens with zero balance
          if (amount === '0') {
            continue;
          }
          
          // Get token info
          const tokenInfo = this.tokenList.find(token => token.address === mintAddress) || {
            address: mintAddress,
            symbol: 'Unknown',
            name: 'Unknown Token',
            decimals
          };
          
          balances.push({
            mint: mintAddress,
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            amount: Number(amount),
            decimals,
            uiAmount,
            logoURI: tokenInfo.logoURI
          });
        }
        
        // Add SOL balance
        const solBalance = await this.connection.getBalance(publicKey);
        if (solBalance > 0) {
          balances.push({
            mint: 'So11111111111111111111111111111111111111112', // Native SOL uses wrapped SOL mint
            symbol: 'SOL',
            name: 'Solana',
            amount: solBalance,
            decimals: 9,
            uiAmount: solBalance / 1e9,
            logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
          });
        }
        
        return balances;
      } catch (error) {
        console.error('Error getting token balances:', error);
        return [];
      }
    });
  }

  /**
   * Get token balances using Helius API
   * @param walletAddress The wallet address to check
   * @returns Array of token balances
   */
  private async getTokenBalancesFromHelius(walletAddress: string): Promise<TokenBalance[]> {
    try {
      const response = await axios.get(
        `https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${this.HELIUS_API_KEY}`
      );
      
      const { tokens, nativeBalance } = response.data;
      const balances: TokenBalance[] = [];
      
      // Add SOL balance
      if (nativeBalance > 0) {
        balances.push({
          mint: 'So11111111111111111111111111111111111111112', // Native SOL uses wrapped SOL mint
          symbol: 'SOL',
          name: 'Solana',
          amount: nativeBalance,
          decimals: 9,
          uiAmount: nativeBalance / 1e9,
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
        });
      }
      
      // Add token balances
      for (const token of tokens) {
        if (token.amount === 0) continue;
        
        // Get token info
        const tokenInfo = this.tokenList.find(t => t.address === token.mint) || {
          address: token.mint,
          symbol: token.symbol || 'Unknown',
          name: token.name || 'Unknown Token',
          decimals: token.decimals || 0
        };
        
        balances.push({
          mint: token.mint,
          symbol: tokenInfo.symbol,
          name: tokenInfo.name,
          amount: token.amount,
          decimals: token.decimals,
          uiAmount: token.amount / Math.pow(10, token.decimals),
          logoURI: tokenInfo.logoURI
        });
      }
      
      return balances;
    } catch (error) {
      console.error('Error getting token balances from Helius:', error);
      throw error;
    }
  }

  /**
   * Get token prices for a list of token balances
   * @param balances Array of token balances
   * @returns The same array with prices and values added
   */
  async getTokenPrices(balances: TokenBalance[]): Promise<TokenBalance[]> {
    try {
      // Get list of mint addresses
      const mintAddresses = balances.map(balance => balance.mint);
      
      // Use Helius API to get prices if available
      if (this.HELIUS_API_KEY) {
        const response = await axios.post(
          `https://api.helius.xyz/v0/token-metadata?api-key=${this.HELIUS_API_KEY}`,
          { mintAccounts: mintAddresses }
        );
        
        const tokenMetadata = response.data;
        
        // Update balances with price information
        return balances.map(balance => {
          const metadata = tokenMetadata.find((m: any) => m.account === balance.mint);
          if (metadata && metadata.price) {
            return {
              ...balance,
              price: metadata.price,
              value: balance.uiAmount * metadata.price
            };
          }
          return balance;
        });
      }
      
      // Fallback to CoinGecko for well-known tokens
      const solanaTokens = this.tokenList.filter(token => token.coingeckoId);
      const coingeckoIds = solanaTokens
        .filter(token => mintAddresses.includes(token.address))
        .map(token => token.coingeckoId)
        .filter(Boolean);
      
      if (coingeckoIds.length > 0) {
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds.join(',')}&vs_currencies=usd`
        );
        
        const prices = response.data;
        
        // Update balances with price information
        return balances.map(balance => {
          const tokenInfo = this.tokenList.find(token => token.address === balance.mint);
          if (tokenInfo && tokenInfo.coingeckoId && prices[tokenInfo.coingeckoId]) {
            const price = prices[tokenInfo.coingeckoId].usd;
            return {
              ...balance,
              price,
              value: balance.uiAmount * price
            };
          }
          return balance;
        });
      }
      
      return balances;
    } catch (error) {
      console.error('Error getting token prices:', error);
      return balances;
    }
  }

  /**
   * Get all token balances with prices for a wallet
   * @param walletAddress The wallet address to check
   * @returns Array of token balances with prices
   */
  async getTokenBalancesWithPrices(walletAddress: string): Promise<TokenBalance[]> {
    const balances = await this.getTokenBalances(walletAddress);
    return this.getTokenPrices(balances);
  }

  /**
   * Calculate the total portfolio value in USD
   * @param balances Array of token balances with prices
   * @returns Total portfolio value in USD
   */
  calculatePortfolioValue(balances: TokenBalance[]): number {
    return balances.reduce((total, balance) => {
      return total + (balance.value || 0);
    }, 0);
  }

  /**
   * Search for tokens by name or symbol
   * @param query Search query
   * @returns Array of matching tokens
   */
  async searchTokens(query: string): Promise<TokenInfo[]> {
    await this.loadTokenList();
    
    const lowerQuery = query.toLowerCase();
    return this.tokenList.filter(token => 
      token.symbol.toLowerCase().includes(lowerQuery) || 
      token.name.toLowerCase().includes(lowerQuery)
    );
  }
}
