export class UserPlan {
  private readonly PLAN_WALLETS = {
    FREE: 3,
    HOBBY: 10,
    PRO: 25,
    WHALE: 50
  };

  constructor() {}

  async getUserPlanWallets(userId: string): Promise<number> {
    // TODO: Get user's plan from database
    // For now, return FREE plan limit
    return this.PLAN_WALLETS.FREE;
  }
}
