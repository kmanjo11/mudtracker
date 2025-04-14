import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import WebSocket from 'ws';
import { NitterService } from '../social/nitter-service';
import { GmgnService } from '../analytics/gmgn-service';
import { HolderAnalysis } from '../analytics/gmgn-service';
import { ChatManager } from '../chat/chat-manager';

interface TokenMetrics {
  address: string;
  symbol: string;
  liquidity: number;
  holders: number;
  volume24h: number;
  socialMentions: number;
  holderScore: number;
  createdAt: Date;
}

interface ScannerConfig {
  minLiquidity: number;
  minHolders: number;
  minVolume: number;
  scanInterval: number;
  scoreThreshold: number;
}

interface PumpFunEvent {
  method: string;
  data: {
    tokenAddress: string;
    symbol: string;
    liquidity: number;
    volume24h: number;
    holders: number;
    createdAt: string;
  }
}

export class TokenScanner {
  private totalScans: number = 0;
  private tokensFound: number = 0;
  private alertsSent: number = 0;
  private lastScan: Date | null = null;

  async getStats(chatId: number): Promise<{
    totalScans: number;
    tokensFound: number;
    alertsSent: number;
    lastScan: Date | null;
  }> {
    return {
      totalScans: this.totalScans,
      tokensFound: this.tokensFound,
      alertsSent: this.alertsSent,
      lastScan: this.lastScan
    };
  }

  async getScannerFilters(chatId: number): Promise<{
    minLiquidity: number;
    minMarketCap: number;
  }> {
    // Default values for now, can be made configurable per chat later
    return {
      minLiquidity: 10000, // $10,000 minimum liquidity
      minMarketCap: 50000  // $50,000 minimum market cap
    };
  }

  private readonly connection: Connection;
  private readonly nitterService: NitterService;
  private readonly gmgnService: GmgnService;
  private readonly chatManager: ChatManager;
  private readonly bot: any; // Assuming bot is defined elsewhere
  private ws: WebSocket | null = null;
  private isScanning: boolean = false;
  
  private readonly config: ScannerConfig = {
    minLiquidity: 10000,    // $10k minimum
    minHolders: 50,         // 50 holders minimum
    minVolume: 5000,        // $5k 24h volume
    scanInterval: 600000,   // 10 minutes
    scoreThreshold: 70      // Minimum score to alert
  };

  constructor(
    connection: Connection,
    nitterService: NitterService,
    gmgnService: GmgnService,
    chatManager: ChatManager,
    bot: any
  ) {
    this.connection = connection;
    this.nitterService = nitterService;
    this.gmgnService = gmgnService;
    this.chatManager = chatManager;
    this.bot = bot;
  }

  async startScanning(): Promise<void> {
    if (!this.isScanning) {
      this.isScanning = true;
      this.connectToPumpFun();
    }
  }

  private connectToPumpFun(): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket('wss://pumpportal.fun/api/data');

    this.ws.on('open', () => {
      console.log('Connected to PumpFun');
      // Subscribe to new token events
      if (this.ws) {
        const payload = {
          method: 'subscribeNewToken'
        };
        this.ws.send(JSON.stringify(payload));
      }
    });

    this.ws.on('message', async (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString()) as PumpFunEvent;
        if (event.method === 'newToken') {
          await this.analyzeToken(event.data);
        }
      } catch (error) {
        console.error('Error processing PumpFun message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('Disconnected from PumpFun, reconnecting...');
      setTimeout(() => this.connectToPumpFun(), 5000);
    });

    this.ws.on('error', (error) => {
      console.error('PumpFun WebSocket error:', error);
      if (this.ws) {
        this.ws.close();
      }
    });
  }

  private async analyzeToken(tokenData: PumpFunEvent['data']): Promise<void> {
    try {
      // Skip if doesn't meet basic criteria
      if (tokenData.liquidity < this.config.minLiquidity ||
          tokenData.holders < this.config.minHolders ||
          tokenData.volume24h < this.config.minVolume) {
        return;
      }

      // 1. Get holder analysis (40% weight)
      const holderAnalysis = await this.gmgnService.analyzeHolders(tokenData.tokenAddress);
      const holderScore = this.calculateHolderScore(holderAnalysis) * 0.4;

      // 2. Get social mentions (35% weight)
      const socialData = await this.nitterService.getTokenMentions(tokenData.symbol, tokenData.tokenAddress);
      const socialScore = this.calculateSocialScore(socialData) * 0.35;

      // 3. Calculate PumpFun metrics score (25% weight)
      const metricsScore = this.calculateMetricsScore(tokenData) * 0.25;

      // Calculate final score
      const finalScore = holderScore + socialScore + metricsScore;

      // Create metrics object
      const metrics: TokenMetrics = {
        address: tokenData.tokenAddress,
        symbol: tokenData.symbol,
        liquidity: tokenData.liquidity,
        holders: tokenData.holders,
        volume24h: tokenData.volume24h,
        socialMentions: socialData.mentions,
        holderScore: holderAnalysis.holderQuality,
        createdAt: new Date(tokenData.createdAt)
      };

      // Alert if score passes threshold
      if (finalScore >= this.config.scoreThreshold) {
        await this.sendAlert(metrics, finalScore);
      }

    } catch (error) {
      // Log analysis errors but continue scanning
      console.error(`Error analyzing token ${tokenData.tokenAddress}:`, error);
    }
  }

  private calculateHolderScore(analysis: HolderAnalysis): number {
    // Scoring based on holder metrics
    let score = 0;
    
    // Total holders
    score += Math.min(analysis.totalHolders / 1000 * 30, 30);
    
    // Holder distribution (whale concentration)
    const whaleRatio = analysis.holderDistribution.whales / analysis.totalHolders;
    score += (1 - whaleRatio) * 40;
    
    // Average hold time (in days)
    score += Math.min(analysis.averageHoldTime / 7 * 30, 30);
    
    return Math.min(score, 100);
  }

  private calculateSocialScore(data: any): number {
    let score = 0;
    
    // Number of mentions
    score += Math.min(data.mentions / 100 * 40, 40);
    
    // Unique users discussing
    score += Math.min(data.uniqueUsers / 50 * 30, 30);
    
    // Engagement rate
    score += Math.min(data.engagement * 30, 30);
    
    return Math.min(score, 100);
  }

  private calculateMetricsScore(data: PumpFunEvent['data']): number {
    let score = 0;
    
    // Liquidity score
    score += Math.min(data.liquidity / this.config.minLiquidity * 40, 40);
    
    // Volume score
    score += Math.min(data.volume24h / this.config.minVolume * 30, 30);
    
    // Holder count score
    score += Math.min(data.holders / this.config.minHolders * 30, 30);
    
    return Math.min(score, 100);
  }

  private async sendAlert(metrics: TokenMetrics, score: number): Promise<void> {
    try {
      // Get all active scanner chats
      const activeChats = await this.chatManager.getActiveChats('scanner');
      
      const message = `
🚨 *New Token Alert!* Score: ${score.toFixed(2)}%

Symbol: $${metrics.symbol}
Address: \`${metrics.address}\`
Liquidity: $${metrics.liquidity.toLocaleString()}
24h Volume: $${metrics.volume24h.toLocaleString()}
Holders: ${metrics.holders.toLocaleString()}
Social Mentions: ${metrics.socialMentions}
Holder Score: ${metrics.holderScore.toFixed(2)}%

Created: ${metrics.createdAt.toLocaleString()}
`;

      // Send to each active chat with their configured thread
      for (const chat of activeChats) {
        try {
          await this.bot.telegram.sendMessage(chat.chatId, message, {
            parse_mode: 'Markdown',
            message_thread_id: chat.threadId
          });
        } catch (error) {
          // Log send errors but continue with other chats
          console.error(`Failed to send alert to chat ${chat.chatId}:`, error);
        }
      }
    } catch (error) {
      // Log general errors but don't interrupt scanning
      console.error('Error in scanner alert system:', error);
    }
  }
}
