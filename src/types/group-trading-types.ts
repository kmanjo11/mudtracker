export enum ExitType {
  DEMOCRATIC = 'democratic',
  ADMIN = 'admin'
}

export interface GroupTrade {
  id: string;
  groupId: string;
  tokenAddress: string;
  tokenSymbol: string;
  createdBy: string;
  exitType: ExitType;
  minParticipants: number;
  maxParticipants: number;
  minEntry: number;
  maxEntry: number;
  maxSlippage: number;
  deadline: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  participants: {
    userId: string;
    walletAddress: string;
    amount: number;
    joinedAt: number;
  }[];
  totalAmount: number;
  profitTarget?: number;
  stopLoss?: number;
  threadId?: number;
}

export interface GroupTradeSettings {
  exitType: ExitType;
  defaultMinParticipants: number;
  defaultMaxParticipants: number;
  defaultMinEntry: number;
  defaultMaxEntry: number;
  defaultMaxSlippage: number;
  defaultDeadline: number;  // in milliseconds
  defaultProfitTarget?: number;
  defaultStopLoss?: number;
}
