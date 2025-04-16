import { ChartRenderer } from '../src/utils/chart-renderer';
import { ChartData } from '../src/services/analytics/chart-service';
import * as fs from 'fs';
import * as path from 'path';

// Simple test function to verify chart rendering
async function testChartRenderer() {
  console.log('Testing chart renderer...');
  
  // Create sample chart data
  const chartData: ChartData = {
    labels: ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
    values: [10.5, 11.2, 10.8, 11.5, 12.3, 11.9, 12.1],
    timestamp: Date.now()
  };
  
  // Create renderer
  const renderer = new ChartRenderer();
  
  try {
    // Render chart
    console.log('Rendering chart...');
    const imagePath = await renderer.renderChart(chartData, 'SOL/USDC', '1h');
    
    // Verify file exists
    if (fs.existsSync(imagePath)) {
      console.log(`✅ Chart image successfully created at: ${imagePath}`);
      
      // Get file size
      const stats = fs.statSync(imagePath);
      console.log(`Image size: ${stats.size} bytes`);
      
      // Clean up
      fs.unlinkSync(imagePath);
      console.log('Test image deleted');
    } else {
      console.error('❌ Chart image was not created');
    }
  } catch (error) {
    console.error('❌ Error testing chart renderer:', error);
  }
}

// Run the test
testChartRenderer().catch(console.error);
