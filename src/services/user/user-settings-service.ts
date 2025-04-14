import { Context } from 'telegraf';
import { Redis } from 'ioredis';

export interface UserSettings {
  userId: string;
  chatId: number;
  botStatus: 'ACTIVE' | 'INACTIVE';
  walletAddress?: string;
  notificationSettings: {
    priceAlerts: boolean;
    tradeNotifications: boolean;
  };
  tradingSettings: {
    maxSlippage: number;
    autoCompound: boolean;
  };
}

export class UserSettingsService {
  private userSettings: Map<number, UserSettings> = new Map();
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    });
  }

  async getUserSettings(ctx: Context): Promise<UserSettings | undefined> {
    if (!ctx.from?.id) return undefined;
    return this.userSettings.get(ctx.from.id);
  }

  async updateBotStatus(userId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    const userIdNum = Number(userId);
    const settings = this.userSettings.get(userIdNum) || this.getDefaultSettings(userId);
    settings.botStatus = status;
    this.userSettings.set(userIdNum, settings);
  }

  async getNotificationSettings(userId: string): Promise<UserSettings['notificationSettings']> {
    const userIdNum = Number(userId);
    const settings = this.userSettings.get(userIdNum) || this.getDefaultSettings(userId);
    return settings.notificationSettings;
  }

  async getTradingSettings(userId: string): Promise<UserSettings['tradingSettings']> {
    const userIdNum = Number(userId);
    const settings = this.userSettings.get(userIdNum) || this.getDefaultSettings(userId);
    return settings.tradingSettings;
  }

  private getDefaultSettings(userId: string): UserSettings {
    return {
      userId,
      chatId: Number(userId),
      botStatus: 'ACTIVE',
      notificationSettings: {
        priceAlerts: true,
        tradeNotifications: true
      },
      tradingSettings: {
        maxSlippage: 1,
        autoCompound: false
      }
    };
  }
}
