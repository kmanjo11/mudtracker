import { TradingAutomationSettings } from '../services/user/user-settings';

declare global {
  namespace PrismaClient {
    interface UserSettings extends TradingAutomationSettings {
      id: string;
      userId: string;
      botStatus: 'ACTIVE' | 'INACTIVE';
      createdAt: Date;
      updatedAt: Date;
    }
  }
}

declare module '@prisma/client' {
  interface PrismaClient {
    userSettings: {
      findUnique: (args: { where: { userId: string } }) => Promise<PrismaClient.UserSettings | null>;
      upsert: (args: {
        where: { userId: string };
        update: Partial<TradingAutomationSettings> & { botStatus?: 'ACTIVE' | 'INACTIVE' };
        create: { userId: string } & Partial<TradingAutomationSettings> & { botStatus: 'ACTIVE' | 'INACTIVE' };
      }) => Promise<PrismaClient.UserSettings>;
    };
  }
}
