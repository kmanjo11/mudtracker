import { MAX_FREE_WALLETS, MAX_HOBBY_WALLETS, MAX_PRO_WALLETS, MAX_WHALE_WALLETS } from '../constants/pricing'
import { PrismaSubscriptionRepository } from '../repositories/prisma/subscription'

export class UserPlan {
  private prismaSubscriptionRepository: PrismaSubscriptionRepository
  constructor() {
    this.prismaSubscriptionRepository = new PrismaSubscriptionRepository()
  }

  public async getUserPlanWallets(userId: string): Promise<number> {
    // Return a very high number to effectively remove wallet limits
    return 999999
  }
}
