import { io, Socket } from 'socket.io-client';

export interface ChartData {
  symbol: string;
  prices: ChartPoint[];
}

export interface ChartPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class DexTradeService {
  private readonly API_URL = 'https://socket.dex-trade.com';
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000;
  private subscriptions: Map<string, (data: any) => void> = new Map();
  private readonly BASE_DECIMAL = 6;  // Changed from 9 to 6 for correct decimal precision
  private readonly RATE_DECIMAL = 8;  // Changed from 9 to 8 for price precision

  constructor() {
    // Remove automatic connection attempt
  }

  private async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    if (this.socket) {
      await new Promise<void>((resolve) => {
        this.socket?.once('disconnect', () => {
          this.socket = null;
          resolve();
        });
        this.socket?.close();
      });
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.API_URL, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS,
          reconnectionDelay: this.RECONNECT_DELAY,
          timeout: 30000 // Increase connection timeout to 30 seconds
        });

        this.socket.on('connect', () => {
          console.log('Connected to DEX Trade socket');
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          console.log(`DEX Trade socket connection closed: ${reason}`);
          if (reason === 'io server disconnect') {
            this.socket?.connect();
          }
        });

        this.socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error);
          this.reconnectAttempts++;
          if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            reject(new Error('Max reconnection attempts reached'));
          }
        });

      } catch (error) {
        console.error('Error creating socket connection:', error);
        reject(error);
      }
    });
  }

  async getTokenChart(symbol: string = 'TRUMPUSD', timeframe: string = '60'): Promise<ChartData> {
    try {
      await this.connect();

      if (!this.socket?.connected) {
        throw new Error('Socket connection is not available');
      }

      return new Promise((resolve, reject) => {
        let chartData: ChartData = {
          symbol,
          prices: []
        };
        
        const messageHandler = (data: any) => {
          if (data?.type === 'graph' && Array.isArray(data?.data) && data.data.length >= 256) {
            // Process bulk candlestick data
            const dataPoints = data.data;
            
            // Process initial candlestick data
            dataPoints.forEach((point: { time: string; open: string; high: string; low: string; close: string; volume: string; room: string }) => {
              const transformedData: ChartPoint = {
                timestamp: parseInt(point.time) * 1000, // Convert to milliseconds
                open: parseFloat(point.open) / 1e8,  // Use 1e8 for price precision as per API
                high: parseFloat(point.high) / 1e8,
                low: parseFloat(point.low) / 1e8,
                close: parseFloat(point.close) / 1e8,
                volume: parseFloat(point.volume) / 1e6  // Use 1e6 for volume as per API
              };
              
              // Only add if not already present and data is valid
              if (!chartData.prices.some((p: ChartPoint) => p.timestamp === transformedData.timestamp) &&
                  !isNaN(transformedData.open) && 
                  !isNaN(transformedData.high) && 
                  !isNaN(transformedData.low) && 
                  !isNaN(transformedData.close) && 
                  !isNaN(transformedData.volume)) {
                chartData.prices.push(transformedData);
              }
            });
        
            // Sort by timestamp to maintain chronological order
            chartData.prices.sort((a: ChartPoint, b: ChartPoint) => a.timestamp - b.timestamp);
            
            // Process all data points in the bulk response and resolve immediately
            this.socket?.off('message', messageHandler);
            this.cleanup(symbol, timeframe);
            resolve(chartData);
          }
        };

        // Set up message handler
        this.socket?.on('message', messageHandler);
        
        // Subscribe to chart data
        this.socket?.emit('subscribe', {
          type: 'graph',
          event: `${symbol}:${timeframe}:1`
        });
      });

    } catch (error) {
      console.error('Error fetching chart data:', error);
      throw error;
    }
  }

  private cleanup(symbol: string, timeframe: string = '60'): void {
    if (this.socket?.connected) {
      // Unsubscribe from the specific chart data stream
      this.socket.emit('unsubscribe', {
        type: 'graph',
        event: `${symbol}:${timeframe}:1`
      });
      // Remove the subscription callback
      this.subscriptions.delete('price');
    }
  }

  public disconnect(): void {
    if (this.socket) {
      try {
        // Cleanup all active subscriptions before disconnecting
        this.subscriptions.forEach((_, symbol) => {
          this.cleanup(symbol);
        });
        this.subscriptions.clear();

        // Close the socket connection and reset state
        this.socket.disconnect();
        this.socket = null;
        this.reconnectAttempts = 0;
      } catch (error) {
        console.error('Error disconnecting from DEX Trade socket:', error);
      }
    }
  }
}
