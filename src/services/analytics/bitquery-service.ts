import { io, Socket } from 'socket.io-client';
import { ChartData } from './chart-service';

export class BitQueryService {
  private readonly API_URL = 'wss://dextrader.fun/api/data';
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000;
  private subscriptions: Map<string, (data: any) => void> = new Map();
  private readonly BASE_DECIMAL = 9;
  private readonly RATE_DECIMAL = 9;

  constructor() {
    this.connect().catch(error => {
      console.error('Failed to establish initial socket connection:', error);
    });
  }

  private async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.API_URL, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
          reconnectionDelay: this.RECONNECT_DELAY
        });

        this.socket.on('connect', () => {
          console.log('Connected to BitQuery socket');
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('disconnect', (reason: string) => {
          console.log(`BitQuery socket connection closed: ${reason}`);
          if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(() => {
              this.connect().catch(error => {
                console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
              });
            }, this.RECONNECT_DELAY);
          } else {
            console.error('Max reconnection attempts reached. Please check your connection and try again later.');
          }
        });

        this.socket.on('error', (error) => {
          console.error('Socket connection error:', error);
          reject(error);
        });

        this.socket.on('price', (data) => {
          const callback = this.subscriptions.get('price');
          if (callback) {
            callback(data);
          }
        });

      } catch (error) {
        console.error('Error creating socket connection:', error);
        reject(error);
      }
    });
  }

  async getTokenChart(symbol: string, timeframe: string = '1d'): Promise<ChartData> {
    try {
      await this.connect();

      if (!this.socket?.connected) {
        throw new Error('Socket connection is not available');
      }

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.subscriptions.delete('price');
          reject(new Error('Request timeout'));
        }, 15000);

        this.subscriptions.set('price', (data) => {
          clearTimeout(timeoutId);
          this.subscriptions.delete('price');

          try {
            const chartData = this.transformToChartData(symbol, data.trades);
            resolve(chartData);
          } catch (error) {
            reject(new Error('Invalid trade data received'));
          }
        });

        this.socket?.emit('subscribe', {
          channel: 'price',
          symbol: symbol,
          timeframe: timeframe
        });
      });

    } catch (error) {
      console.error('Error fetching chart data:', error);
      throw error;
    }
  }
  private transformToChartData(symbol: string, trades: any[]): ChartData {
    const timestamps = trades.map(trade => new Date(trade.timestamp).toLocaleTimeString());
    const values = trades.map(trade => parseFloat(trade.close));
    
    return {
      labels: timestamps,
      values: values,
      timestamp: Date.now()
    };
  }
  private getTimeframeSeconds(timeframe: string): string {
    const timeframes: { [key: string]: string } = {
      '1h': '3600',
      '24h': '86400',
      '7d': '604800',
      '30d': '2592000',
      '1m': '60',
      '5m': '300',
      '15m': '900',
      '30m': '1800'
    };
    return timeframes[timeframe] || '3600';
  }
  private cleanup(room: string): void {
    this.subscriptions.delete(room);
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe', room);
    }
  }
  public disconnect(): void {
    if (this.socket) {
      try {
        // Clean up all active subscriptions
        this.subscriptions.forEach((_, room) => {
          this.cleanup(room);
        });
        this.subscriptions.clear();

        this.socket.disconnect();
        this.socket = null;
        this.reconnectAttempts = 0;
      } catch (error) {
        console.error('Error disconnecting socket:', error);
      }
    }
  }
}
