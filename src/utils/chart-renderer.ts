import { ChartData } from '../services/analytics/chart-service';
import { createCanvas, CanvasRenderingContext2D as NodeCanvasRenderingContext2D } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

export class ChartRenderer {
  private readonly WIDTH = 800;
  private readonly HEIGHT = 400;
  private readonly PADDING = 40;
  private readonly LINE_COLOR = '#4CAF50';
  private readonly GRID_COLOR = '#2c2c2c';
  private readonly TEXT_COLOR = '#ffffff';
  private readonly BACKGROUND_COLOR = '#1a1a1a';
  private readonly FONT = '12px Arial';
  private readonly TITLE_FONT = 'bold 16px Arial';

  /**
   * Renders a chart image from the provided chart data
   * @param chartData The data to render
   * @param symbol The trading pair symbol
   * @param timeframe The timeframe of the chart
   * @returns Path to the generated image file
   */
  async renderChart(chartData: ChartData, symbol: string, timeframe: string): Promise<string> {
    const canvas = createCanvas(this.WIDTH, this.HEIGHT);
    const ctx = canvas.getContext('2d');
    
    // Draw background
    ctx.fillStyle = this.BACKGROUND_COLOR;
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
    
    // Draw grid
    this.drawGrid(ctx);
    
    // Draw chart title
    this.drawTitle(ctx, `${symbol} - ${timeframe}`);
    
    // Draw axes
    this.drawAxes(ctx, chartData);
    
    // Draw price line
    this.drawPriceLine(ctx, chartData);
    
    // Draw price info
    this.drawPriceInfo(ctx, chartData);
    
    // Save the image
    const outputDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filename = `chart_${symbol.replace('/', '_')}_${timeframe}_${Date.now()}.png`;
    const outputPath = path.join(outputDir, filename);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    
    return outputPath;
  }
  
  private drawGrid(ctx: NodeCanvasRenderingContext2D): void {
    ctx.strokeStyle = this.GRID_COLOR;
    ctx.lineWidth = 0.5;
    
    // Vertical grid lines
    for (let x = this.PADDING; x <= this.WIDTH - this.PADDING; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, this.PADDING);
      ctx.lineTo(x, this.HEIGHT - this.PADDING);
      ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let y = this.PADDING; y <= this.HEIGHT - this.PADDING; y += 50) {
      ctx.beginPath();
      ctx.moveTo(this.PADDING, y);
      ctx.lineTo(this.WIDTH - this.PADDING, y);
      ctx.stroke();
    }
  }
  
  private drawTitle(ctx: NodeCanvasRenderingContext2D, title: string): void {
    ctx.font = this.TITLE_FONT;
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText(title, this.WIDTH / 2, 25);
  }
  
  private drawAxes(ctx: NodeCanvasRenderingContext2D, chartData: ChartData): void {
    ctx.strokeStyle = this.TEXT_COLOR;
    ctx.lineWidth = 1;
    ctx.font = this.FONT;
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(this.PADDING, this.HEIGHT - this.PADDING);
    ctx.lineTo(this.WIDTH - this.PADDING, this.HEIGHT - this.PADDING);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(this.PADDING, this.PADDING);
    ctx.lineTo(this.PADDING, this.HEIGHT - this.PADDING);
    ctx.stroke();
    
    // X-axis labels (time)
    const xStep = (this.WIDTH - 2 * this.PADDING) / (chartData.labels.length - 1 || 1);
    for (let i = 0; i < chartData.labels.length; i += Math.ceil(chartData.labels.length / 5)) {
      const x = this.PADDING + i * xStep;
      ctx.fillStyle = this.TEXT_COLOR;
      ctx.textAlign = 'center';
      ctx.fillText(chartData.labels[i], x, this.HEIGHT - this.PADDING + 15);
    }
    
    // Y-axis labels (price)
    const min = Math.min(...chartData.values);
    const max = Math.max(...chartData.values);
    const range = max - min || 1;
    
    for (let i = 0; i <= 5; i++) {
      const value = min + (range * i / 5);
      const y = this.HEIGHT - this.PADDING - ((value - min) / range) * (this.HEIGHT - 2 * this.PADDING);
      
      ctx.fillStyle = this.TEXT_COLOR;
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(4), this.PADDING - 5, y + 4);
    }
  }
  
  private drawPriceLine(ctx: NodeCanvasRenderingContext2D, chartData: ChartData): void {
    if (chartData.values.length === 0) return;
    
    const min = Math.min(...chartData.values);
    const max = Math.max(...chartData.values);
    const range = max - min || 1;
    
    const xStep = (this.WIDTH - 2 * this.PADDING) / (chartData.values.length - 1 || 1);
    
    // Draw line
    ctx.strokeStyle = this.LINE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < chartData.values.length; i++) {
      const x = this.PADDING + i * xStep;
      const y = this.HEIGHT - this.PADDING - ((chartData.values[i] - min) / range) * (this.HEIGHT - 2 * this.PADDING);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = this.LINE_COLOR;
    for (let i = 0; i < chartData.values.length; i += Math.ceil(chartData.values.length / 10)) {
      const x = this.PADDING + i * xStep;
      const y = this.HEIGHT - this.PADDING - ((chartData.values[i] - min) / range) * (this.HEIGHT - 2 * this.PADDING);
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  private drawPriceInfo(ctx: NodeCanvasRenderingContext2D, chartData: ChartData): void {
    if (chartData.values.length === 0) return;
    
    const latestValue = chartData.values[chartData.values.length - 1];
    const minValue = Math.min(...chartData.values);
    const maxValue = Math.max(...chartData.values);
    
    ctx.font = this.FONT;
    ctx.fillStyle = this.TEXT_COLOR;
    ctx.textAlign = 'left';
    
    const infoX = this.WIDTH - this.PADDING - 150;
    const infoY = this.PADDING + 30;
    
    ctx.fillText(`Latest: ${latestValue.toFixed(4)}`, infoX, infoY);
    ctx.fillText(`High: ${maxValue.toFixed(4)}`, infoX, infoY + 20);
    ctx.fillText(`Low: ${minValue.toFixed(4)}`, infoX, infoY + 40);
    ctx.fillText(`Points: ${chartData.values.length}`, infoX, infoY + 60);
  }
}
