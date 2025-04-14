import { Redis } from 'ioredis';

export interface CircuitBreakerConfig {
  failureThreshold: number;     // How many failures before opening
  resetTimeout: number;         // How long to wait before trying again (ms)
  monitorInterval: number;      // How often to check health (ms)
}

export enum CircuitState {
  CLOSED = 'CLOSED',           // Normal operation
  OPEN = 'OPEN',              // Service disabled
  HALF_OPEN = 'HALF_OPEN'     // Testing if service recovered
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private redis: Redis;

  constructor(
    private readonly serviceName: string,
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 5,      // Open after 5 failures
      resetTimeout: 60000,      // Try again after 1 minute
      monitorInterval: 30000    // Check every 30 seconds
    }
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });

    // Start monitoring
    this.startMonitoring();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (await this.isOpen()) {
      throw new Error(`Circuit breaker is OPEN for service: ${this.serviceName}`);
    }

    try {
      const result = await operation();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure();
      throw error;
    }
  }

  private async recordSuccess(): Promise<void> {
    const key = `circuit:${this.serviceName}`;
    await this.redis.multi()
      .set(`${key}:failures`, '0')
      .set(`${key}:state`, CircuitState.CLOSED)
      .exec();
  }

  private async recordFailure(): Promise<void> {
    const key = `circuit:${this.serviceName}`;
    const failures = await this.redis.incr(`${key}:failures`);
    
    if (failures >= this.config.failureThreshold) {
      await this.redis.multi()
        .set(`${key}:state`, CircuitState.OPEN)
        .set(`${key}:lastFailure`, Date.now().toString())
        .exec();
    }
  }

  private async isOpen(): Promise<boolean> {
    const key = `circuit:${this.serviceName}`;
    const state = await this.redis.get(`${key}:state`) as CircuitState;
    
    if (state === CircuitState.OPEN) {
      const lastFailure = parseInt(await this.redis.get(`${key}:lastFailure`) || '0');
      const hasTimedOut = Date.now() - lastFailure > this.config.resetTimeout;
      
      if (hasTimedOut) {
        await this.redis.set(`${key}:state`, CircuitState.HALF_OPEN);
        return false;
      }
      return true;
    }
    
    return false;
  }

  private async startMonitoring(): Promise<void> {
    setInterval(async () => {
      const key = `circuit:${this.serviceName}`;
      const state = await this.redis.get(`${key}:state`) as CircuitState;
      
      if (state === CircuitState.HALF_OPEN) {
        // Test the service with a probe request
        try {
          await this.testService();
          await this.recordSuccess();
        } catch (error) {
          await this.recordFailure();
        }
      }
    }, this.config.monitorInterval);
  }

  private async testService(): Promise<void> {
    // This is a placeholder implementation
    // In a real application, you would implement a lightweight health check
    // specific to the service being protected
    // For example, you could make a GET request to a health endpoint
    const response = await fetch(`https://example.com/health`);
    if (!response.ok) {
      throw new Error(`Health check failed with status code ${response.status}`);
    }
  }
}
