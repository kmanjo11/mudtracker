import { Connection } from '@solana/web3.js';

export class UserService {
  constructor(private connection: Connection) {}

  async getUserBalance(userId: string): Promise<number> {
    // Implement user balance logic
    return 0;
  }

  async getUserLeverage(userId: string): Promise<number> {
    // Default leverage
    return 2;
  }

  async setUserLeverage(userId: string, leverage: number): Promise<void> {
    // Implement set leverage logic
  }

  async getUserPreferences(userId: string): Promise<{
    defaultLeverage: number;
    maxLeverage: number;
    riskLevel: string;
  }> {
    return {
      defaultLeverage: 2,
      maxLeverage: 10,
      riskLevel: 'medium'
    };
  }
}
