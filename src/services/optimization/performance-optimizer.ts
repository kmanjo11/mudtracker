import { Redis } from 'ioredis';
import { Connection } from '@solana/web3.js';
import { Worker, isMainThread, parentPort, workerData, WorkerOptions } from 'worker_threads';
import * as cluster from 'cluster';
import * as os from 'os';

interface CacheConfig<T = unknown> {
  ttl: number;
  maxSize: number;
  priority: CachePriority;
}

interface QueueItem<T = unknown> {
  priority: QueuePriority;
  timestamp: number;
  data: T;
  type: QueueItemType;
}

interface WorkerMessage {
  type: 'status' | 'result' | 'error';
  workerId: number;
  data: unknown;
  error?: string;
}

interface CacheItem<T = unknown> {
  data: T;
  priority: CachePriority;
  timestamp: number;
}

interface RateLimit {
  max: number;
  window: number; // in seconds
}

type CachePriority = 'high' | 'medium' | 'low';
type QueuePriority = 1 | 2 | 3 | 4 | 5;
type QueueItemType = 'scan' | 'analysis' | 'notification';
type RateLimitType = 'api_calls' | 'notifications' | 'scans';

export class PerformanceOptimizer {
  private readonly redis: Redis;
  private readonly workers: Worker[] = [];
  private readonly MAX_WORKERS = os.cpus().length;
  private readonly RATE_LIMITS: Record<RateLimitType, RateLimit> = {
    'api_calls': { max: 100, window: 60 }, // 100 calls per minute
    'notifications': { max: 10, window: 60 }, // 10 notifications per minute
    'scans': { max: 6, window: 60 } // 6 scans per minute
  };

  constructor() {
    if (!process.env.REDIS_HOST || !process.env.REDIS_PORT || !process.env.REDIS_PASSWORD) {
      throw new Error('Redis configuration is incomplete');
    }

    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT, 10),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    if (!isMainThread) return;

    for (let i = 0; i < this.MAX_WORKERS; i++) {
      try {
        const workerOptions: WorkerOptions = {
          workerData: { workerId: i }
        };

        const worker = new Worker(__filename, workerOptions);
        worker.on('message', this.handleWorkerMessage.bind(this));
        worker.on('error', this.handleWorkerError.bind(this));
        worker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`Worker ${i} exited with code ${code}`);
            this.restartWorker(i);
          }
        });
        
        this.workers.push(worker);
      } catch (error) {
        console.error(`Failed to initialize worker ${i}:`, error);
      }
    }
  }

  public async cacheData<T>(
    key: string,
    data: T,
    config: CacheConfig<T>
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key);
      
      const currentSize = await this.redis.dbsize();
      if (currentSize >= config.maxSize) {
        await this.evictCache(config.priority);
      }

      const cacheItem: CacheItem<T> = {
        data,
        priority: config.priority,
        timestamp: Date.now()
      };

      await this.redis.setex(
        cacheKey,
        config.ttl,
        JSON.stringify(cacheItem)
      );
    } catch (error) {
      console.error('Cache operation failed:', error);
      throw new Error(`Failed to cache data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async evictCache(priority: CachePriority): Promise<void> {
    try {
      const keys = await this.redis.keys('cache:*');
      const cacheItems = await Promise.all(
        keys.map(async (key) => {
          const item = await this.redis.get(key);
          return {
            key,
            ...(JSON.parse(item!) as CacheItem<unknown>)
          };
        })
      );

      cacheItems.sort((a, b) => {
        const priorityDiff = this.getPriorityScore(b.priority) - this.getPriorityScore(a.priority);
        return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
      });

      const toRemove = cacheItems.slice(Math.floor(cacheItems.length * 0.2));
      await Promise.all(
        toRemove.map(item => this.redis.del(item.key))
      );
    } catch (error) {
      console.error('Cache eviction failed:', error);
      throw new Error(`Failed to evict cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getPriorityScore(priority: CachePriority): number {
    const scores: Record<CachePriority, number> = {
      high: 3,
      medium: 2,
      low: 1
    };
    return scores[priority];
  }

  public async addToQueue<T>(item: QueueItem<T>): Promise<void> {
    try {
      const priority = this.calculatePriority(item);
      await this.redis.zadd(
        'task_queue',
        priority,
        JSON.stringify(item)
      );
    } catch (error) {
      console.error('Failed to add item to queue:', error);
      throw new Error(`Queue operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async processQueue(): Promise<void> {
    try {
      while (true) {
        const item = await this.getNextQueueItem<unknown>();
        if (!item) break;

        await this.processQueueItem(item);
      }
    } catch (error) {
      console.error('Queue processing failed:', error);
      throw new Error(`Failed to process queue: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private calculatePriority(item: QueueItem): number {
    const now = Date.now();
    const age = (now - item.timestamp) / 1000;
    return Number(item.priority) * (1 + (age / 3600));
  }

  private async getNextQueueItem<T>(): Promise<QueueItem<T> | null> {
    try {
      const result = await this.redis.zpopmin('task_queue');
      if (!result.length) return null;
      return JSON.parse(result[0]) as QueueItem<T>;
    } catch (error) {
      console.error('Failed to get next queue item:', error);
      throw new Error(`Queue operation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processQueueItem<T>(item: QueueItem<T>): Promise<void> {
    try {
      // Process based on item type
      switch (item.type) {
        case 'scan':
          // Handle scan tasks
          break;
        case 'analysis':
          // Handle analysis tasks
          break;
        case 'notification':
          // Handle notification tasks
          break;
        default:
          throw new Error(`Unknown queue item type: ${item.type}`);
      }
    } catch (error) {
      console.error('Failed to process queue item:', error);
      throw new Error(`Queue item processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Rate Limiting
  public async checkRateLimit(type: RateLimitType): Promise<boolean> {
    try {
      const limit = this.RATE_LIMITS[type];
      if (!limit) throw new Error(`Unknown rate limit type: ${type}`);

      const key = `ratelimit:${type}`;
      const current = await this.redis.incr(key);
      
      if (current === 1) {
        await this.redis.expire(key, limit.window);
      }

      return current <= limit.max;
    } catch (error) {
      console.error('Rate limit check failed:', error);
      return false;
    }
  }

  // Worker Management
  private async handleWorkerMessage(message: WorkerMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'status':
          await this.updateWorkerLoad(message.workerId, message.data as number);
          break;
        case 'result':
          // Handle worker results
          break;
        case 'error':
          console.error(`Worker ${message.workerId} error:`, message.error);
          break;
      }
    } catch (error) {
      console.error('Failed to handle worker message:', error);
    }
  }

  private handleWorkerError(error: Error): void {
    console.error('Worker error:', error);
  }

  private async restartWorker(workerId: number): Promise<void> {
    try {
      const worker = this.workers[workerId];
      if (worker) {
        worker.terminate();
        const newWorker = new Worker(__filename, {
          workerData: { workerId }
        });
        
        newWorker.on('message', this.handleWorkerMessage.bind(this));
        newWorker.on('error', this.handleWorkerError.bind(this));
        
        this.workers[workerId] = newWorker;
      }
    } catch (error) {
      console.error(`Failed to restart worker ${workerId}:`, error);
    }
  }

  private async updateWorkerLoad(workerId: number, load: number): Promise<void> {
    try {
      await this.redis.hset('worker_loads', workerId.toString(), load);
    } catch (error) {
      console.error('Failed to update worker load:', error);
    }
  }

  // Cleanup
  public async cleanup(): Promise<void> {
    try {
      await Promise.all(this.workers.map(worker => worker.terminate()));
      await this.redis.quit();
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  private generateCacheKey(key: string): string {
    return `cache:${key}`;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async telegramAlertService(): Promise<void> {
    // Telegram alert service
  }

  private async gatherMetrics(): Promise<any> {
    return {
      cpuUsage: process.cpuUsage().system,
      memoryUsage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100
    };
  }
}
