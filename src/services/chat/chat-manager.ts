import { Redis } from 'ioredis';

interface ChatConfig {
  chatId: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  threadId?: number;
  features: {
    scanner?: boolean;
    walletTracker?: boolean;
  };
  adminIds: number[];
}

export class ChatManager {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });
  }

  async registerChat(config: ChatConfig): Promise<void> {
    await this.redis.set(
      `chat:${config.chatId}:config`,
      JSON.stringify(config)
    );
  }

  async getChatConfig(chatId: number): Promise<ChatConfig | null> {
    const config = await this.redis.get(`chat:${chatId}:config`);
    return config ? JSON.parse(config) : null;
  }

  async updateChatConfig(chatId: number, updates: Partial<ChatConfig>): Promise<void> {
    const config = await this.getChatConfig(chatId);
    if (config) {
      await this.registerChat({ ...config, ...updates });
    }
  }

  async setThreadId(chatId: number, threadId: number): Promise<void> {
    const config = await this.getChatConfig(chatId);
    if (config) {
      config.threadId = threadId;
      await this.registerChat(config);
    }
  }

  async isAdmin(chatId: number, userId: number): Promise<boolean> {
    const config = await this.getChatConfig(chatId);
    return config?.adminIds.includes(userId) || false;
  }

  async addAdmin(chatId: number, userId: number): Promise<void> {
    const config = await this.getChatConfig(chatId);
    if (config && !config.adminIds.includes(userId)) {
      config.adminIds.push(userId);
      await this.registerChat(config);
    }
  }

  async removeAdmin(chatId: number, userId: number): Promise<void> {
    const config = await this.getChatConfig(chatId);
    if (config) {
      config.adminIds = config.adminIds.filter(id => id !== userId);
      await this.registerChat(config);
    }
  }

  async getActiveChats(feature: 'scanner' | 'walletTracker'): Promise<ChatConfig[]> {
    const keys = await this.redis.keys('chat:*:config');
    const configs: ChatConfig[] = [];

    for (const key of keys) {
      const config = await this.getChatConfig(parseInt(key.split(':')[1]));
      if (config && config.features[feature]) {
        configs.push(config);
      }
    }

    return configs;
  }

  async cleanupInactiveChats(): Promise<void> {
    // Implement cleanup logic for chats where bot was removed
  }
}
