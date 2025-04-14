import { DexTradeService, ChartData as DexChartData, ChartPoint as DexChartPoint } from './dex-trade-service';

export interface ChartData {
  labels: string[];
  values: number[];
  timestamp: number;
}

export class ChartService {
  constructor(private dexTradeService: DexTradeService) {}

  async getTokenChartData(tokenAddress: string, timeframe: string = '1h'): Promise<ChartData> {
    try {
      const chartData = await this.dexTradeService.getTokenChart(tokenAddress, timeframe);
      return this.formatChartData(chartData);
    } catch (error) {
      console.error('Error getting token chart data:', error);
      throw error;
    }
  }

  private formatChartData(data: DexChartData): ChartData {
    const timestamps = data.prices.map((p: DexChartPoint) => new Date(p.timestamp).toLocaleTimeString());
    const values = data.prices.map((p: DexChartPoint) => p.close); // Using close price for the chart

    return {
      labels: timestamps,
      values: values,
      timestamp: Date.now()
    };
  }

  async generateChartImage(chartData: ChartData): Promise<string> {
    const latestValue = chartData.values[chartData.values.length - 1];
    const minValue = Math.min(...chartData.values);
    const maxValue = Math.max(...chartData.values);
    
    return `📊 Chart Summary\n` +
           `Latest: ${latestValue.toFixed(4)}\n` +
           `High: ${maxValue.toFixed(4)}\n` +
           `Low: ${minValue.toFixed(4)}\n` +
           `Points: ${chartData.values.length}`;
  }
}
