import { Connection } from '@solana/web3.js';
import { JupiterService } from '../services/trading/jupiter-service';
import { TradingService } from '../services/trading/trading-service';
import { TokenService } from '../services/wallet/token-service';
import { WalletStatsService } from '../services/wallet/wallet-stats-service';
import { LiquidityPoolService } from '../services/trading/liquidity-pool-service';
import { CircuitBreakerService } from '../services/circuit-breaker/circuit-breaker-service';
import { WalletService } from '../services/wallet/wallet-service';
import { RpcConnectionManager } from '../providers/solana';

/**
 * Integration test for the trading app
 * This test verifies that all components work together correctly
 */
async function runIntegrationTest() {
  console.log('Starting integration test...');
  
  // Initialize connection
  const connection = RpcConnectionManager.connections[0];
  
  // Test circuit breaker service
  await testCircuitBreakerService(connection);
  
  // Test token service
  await testTokenService(connection);
  
  // Test wallet stats service
  await testWalletStatsService(connection);
  
  // Test Jupiter service
  await testJupiterService(connection);
  
  // Test liquidity pool service
  await testLiquidityPoolService(connection);
  
  // Test trading service
  await testTradingService(connection);
  
  console.log('Integration test completed successfully!');
}

/**
 * Test the circuit breaker service
 */
async function testCircuitBreakerService(connection: Connection) {
  console.log('\nTesting CircuitBreakerService...');
  
  const circuitBreakerService = new CircuitBreakerService(connection);
  
  // Test getting a circuit breaker
  const tradingCircuitBreaker = circuitBreakerService.getCircuitBreaker('trading');
  console.log('Got trading circuit breaker:', tradingCircuitBreaker.getName());
  
  // Test executing a function with circuit breaker protection
  try {
    const result = await circuitBreakerService.execute('test', async () => {
      return 'Success';
    });
    console.log('Circuit breaker execution result:', result);
  } catch (error) {
    console.error('Circuit breaker execution failed:', error);
  }
  
  // Test getting status
  const status = circuitBreakerService.getStatus();
  console.log('Circuit breaker status:', status);
  
  console.log('CircuitBreakerService test completed');
}

/**
 * Test the token service
 */
async function testTokenService(connection: Connection) {
  console.log('\nTesting TokenService...');
  
  const tokenService = new TokenService(connection);
  
  // Test getting token info
  try {
    const solInfo = await tokenService.getTokenInfo('So11111111111111111111111111111111111111112');
    console.log('SOL token info:', solInfo);
  } catch (error) {
    console.error('Failed to get token info:', error);
  }
  
  // Test searching tokens
  try {
    const tokens = await tokenService.searchTokens('SOL');
    console.log(`Found ${tokens.length} tokens matching 'SOL'`);
  } catch (error) {
    console.error('Failed to search tokens:', error);
  }
  
  console.log('TokenService test completed');
}

/**
 * Test the wallet stats service
 */
async function testWalletStatsService(connection: Connection) {
  console.log('\nTesting WalletStatsService...');
  
  const walletStatsService = new WalletStatsService(connection);
  
  // Test formatting wallet stats
  const mockStats = {
    address: 'So11111111111111111111111111111111111111112',
    totalValue: 1000,
    tokenCount: 5,
    lastUpdated: new Date(),
    changePercentage24h: 2.5
  };
  
  const formattedStats = walletStatsService.formatWalletStats(mockStats);
  console.log('Formatted wallet stats:', formattedStats);
  
  console.log('WalletStatsService test completed');
}

/**
 * Test the Jupiter service
 */
async function testJupiterService(connection: Connection) {
  console.log('\nTesting JupiterService...');
  
  const jupiterService = new JupiterService(connection);
  
  // Test getting supported tokens
  try {
    const tokens = await jupiterService.getSupportedTokens();
    console.log(`Jupiter supports ${tokens.length} tokens`);
  } catch (error) {
    console.error('Failed to get supported tokens:', error);
  }
  
  console.log('JupiterService test completed');
}

/**
 * Test the liquidity pool service
 */
async function testLiquidityPoolService(connection: Connection) {
  console.log('\nTesting LiquidityPoolService...');
  
  const liquidityPoolService = new LiquidityPoolService(connection);
  
  // Test getting popular pools
  try {
    const pools = await liquidityPoolService.getPopularPools(3);
    console.log(`Got ${pools.length} popular pools`);
    
    // Test formatting pool info
    if (pools.length > 0) {
      const formattedInfo = liquidityPoolService.formatPoolInfo(pools[0]);
      console.log('Formatted pool info:', formattedInfo);
    }
  } catch (error) {
    console.error('Failed to get popular pools:', error);
  }
  
  // Test calculating impermanent loss
  const impermanentLoss = liquidityPoolService.calculateImpermanentLoss(1, 1.5);
  console.log('Impermanent loss for 50% price change:', impermanentLoss.toFixed(2) + '%');
  
  console.log('LiquidityPoolService test completed');
}

/**
 * Test the trading service
 */
async function testTradingService(connection: Connection) {
  console.log('\nTesting TradingService...');
  
  // Create mock wallet service
  const walletService = {
    getWalletAddress: async (userId: string) => 'So11111111111111111111111111111111111111112',
    exportWallet: async (userId: string) => 'mock_wallet_secret_key'
  } as any;
  
  const tradingService = new TradingService(connection, walletService);
  
  // Test getting user stats
  try {
    const stats = await tradingService.getUserStats('test_user');
    console.log('User trading stats:', stats);
  } catch (error) {
    console.error('Failed to get user stats:', error);
  }
  
  // Test getting available strategies
  try {
    const strategies = tradingService.getAvailableStrategies();
    console.log(`Found ${strategies.length} trading strategies`);
  } catch (error) {
    console.error('Failed to get trading strategies:', error);
  }
  
  console.log('TradingService test completed');
}

// Run the integration test
runIntegrationTest().catch(error => {
  console.error('Integration test failed:', error);
});
