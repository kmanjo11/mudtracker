import { Connection, PublicKey } from '@solana/web3.js';
import { CircuitBreaker } from '../circuit-breaker/circuit-breaker';

export class CircuitBreakerService {
  private readonly connection: Connection;
  private readonly circuitBreakers: Map<string, CircuitBreaker>;
  
  constructor(connection: Connection) {
    this.connection = connection;
    this.circuitBreakers = new Map();
    
    // Initialize default circuit breakers
    this.circuitBreakers.set('trading', new CircuitBreaker('trading', {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitorInterval: 10000
    }));
    
    this.circuitBreakers.set('wallet', new CircuitBreaker('wallet', {
      failureThreshold: 3,
      resetTimeout: 30000,
      monitorInterval: 5000
    }));
    
    this.circuitBreakers.set('liquidity', new CircuitBreaker('liquidity', {
      failureThreshold: 3,
      resetTimeout: 60000,
      monitorInterval: 10000
    }));
  }
  
  /**
   * Get a circuit breaker by name
   * @param name The name of the circuit breaker
   * @returns The circuit breaker instance
   */
  getCircuitBreaker(name: string): CircuitBreaker {
    let circuitBreaker = this.circuitBreakers.get(name);
    
    if (!circuitBreaker) {
      // Create a new circuit breaker with default settings
      circuitBreaker = new CircuitBreaker(name, {
        failureThreshold: 3,
        resetTimeout: 30000,
        monitorInterval: 5000
      });
      
      this.circuitBreakers.set(name, circuitBreaker);
    }
    
    return circuitBreaker;
  }
  
  /**
   * Check if a circuit breaker is open (tripped)
   * @param name The name of the circuit breaker
   * @returns True if the circuit breaker is open
   */
  isOpen(name: string): boolean {
    const circuitBreaker = this.getCircuitBreaker(name);
    return circuitBreaker.isOpen();
  }
  
  /**
   * Execute a function with circuit breaker protection
   * @param name The name of the circuit breaker
   * @param fn The function to execute
   * @returns The result of the function
   */
  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(name);
    return circuitBreaker.execute(fn);
  }
  
  /**
   * Reset a circuit breaker
   * @param name The name of the circuit breaker
   */
  reset(name: string): void {
    const circuitBreaker = this.getCircuitBreaker(name);
    circuitBreaker.reset();
  }
  
  /**
   * Get the status of all circuit breakers
   * @returns A map of circuit breaker names to their status
   */
  getStatus(): Map<string, { open: boolean, failures: number, lastFailure: Date | null }> {
    const status = new Map<string, { open: boolean, failures: number, lastFailure: Date | null }>();
    
    for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
      status.set(name, {
        open: circuitBreaker.isOpen(),
        failures: circuitBreaker.getFailureCount(),
        lastFailure: circuitBreaker.getLastFailure()
      });
    }
    
    return status;
  }
}
