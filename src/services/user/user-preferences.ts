import { Redis } from 'ioredis';

interface ScannerPreferences {
  minLiquidity: number;
  minScore: number;
  notifyInterval: number;
  excludeTokens: string[];
}

export class UserPreferences {
  private redis: Redis;

  constructor() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;
    const redisPassword = process.env.REDIS_PASSWORD;

    const options: any = {
      host: redisHost,
      port: redisPort
    };

    if (redisPassword) {
      options.password = redisPassword;
    }

    this.redis = new Redis(options);
  }

  async get(userId: number): Promise<ScannerPreferences> {
    const prefs = await this.redis.get(`user:${userId}:preferences`);
    if (prefs) {
      return JSON.parse(prefs);
    }

    // Default preferences
    return {
      minLiquidity: 10000,  // $10k minimum liquidity
      minScore: 70,         // 70/100 minimum score
      notifyInterval: 300000, // 5 minutes
      excludeTokens: []
    };
  }

  async set(userId: number, preferences: Partial<ScannerPreferences>): Promise<void> {
    const currentPrefs = await this.get(userId);
    const updatedPrefs = { ...currentPrefs, ...preferences };
    await this.redis.set(
      `user:${userId}:preferences`,
      JSON.stringify(updatedPrefs)
    );
  }

  async getActiveFeeds(userId: number): Promise<string[]> {
    const feeds = await this.redis.get(`user:${userId}:active_feeds`);
    return feeds ? JSON.parse(feeds) : [];
  }

  async setActiveFeed(userId: number, feed: string, active: boolean): Promise<void> {
    let feeds = await this.getActiveFeeds(userId);
    
    if (active && !feeds.includes(feed)) {
      feeds.push(feed);
    } else if (!active) {
      feeds = feeds.filter(f => f !== feed);
    }

    await this.redis.set(
      `user:${userId}:active_feeds`,
      JSON.stringify(feeds)
    );
  }
}
