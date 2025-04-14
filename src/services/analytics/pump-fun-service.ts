import WebSocket from 'ws';
import axios from 'axios';
import { EventEmitter } from 'events';

export interface PumpFunChartData {
  symbol: string;
  prices: {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  indicators?: {
    rsi?: number[];
    macd?: {
      macdLine: number[];
      signalLine: number[];
      histogram: number[];
    };
  };
}

export class PumpFunService extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly API_URL = 'https://pumpportal.fun/api';
  private readonly WS_URL = 'wss://pumpportal.fun/api/data';
  private subscriptions: Set<string> = new Set();

  constructor() {
    super();
  }

  async connect(): Promise<void> {
    if (this.ws) return;

    this.ws = new WebSocket(this.WS_URL);

    this.ws.on('open', () => {
      console.log('Connected to PumpFun WebSocket');
      // Resubscribe to all active subscriptions
      this.subscriptions.forEach(symbol => {
        this.subscribeToPriceUpdates(symbol);
      });
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'price') {
          this.emit('price', {
            symbol: message.symbol,
            price: message.price,
            timestamp: message.timestamp
          });
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });

    this.ws.on('close', () => {
      console.log('PumpFun WebSocket connection closed');
      this.ws = null;
      // Attempt to reconnect after 5 seconds
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (error) => {
      console.error('PumpFun WebSocket error:', error);
    });
  }

  async getTokenChart(symbol: string, timeframe: string = '1d'): Promise<PumpFunChartData> {
    try {
      const response = await axios.get(
        `${this.API_URL}/charts/${symbol}?timeframe=${timeframe}`
      );

      return this.processChartData(response.data);
    } catch (error) {
      console.error('Error fetching chart data:', error);
      throw error;
    }
  }

  async subscribeToPriceUpdates(symbol: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    this.subscriptions.add(symbol);
    this.ws?.send(JSON.stringify({
      type: 'subscribe',
      channel: 'price',
      symbol: symbol
    }));
  }

  async unsubscribeFromPriceUpdates(symbol: string): Promise<void> {
    this.subscriptions.delete(symbol);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'price',
        symbol: symbol
      }));
    }
  }

  private processChartData(data: any): PumpFunChartData {
    return {
      symbol: data.symbol,
      prices: data.prices.map((p: any) => ({
        timestamp: p.timestamp,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        volume: p.volume
      })),
      indicators: {
        rsi: data.indicators?.rsi,
        macd: data.indicators?.macd
      }
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}