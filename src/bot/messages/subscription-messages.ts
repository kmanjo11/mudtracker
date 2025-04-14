import { format, formatDistanceToNow } from 'date-fns';
import { BOT_USERNAME } from '../../constants/handi-cat';
import {
  HOBBY_PLAN_FEE,
  MAX_HOBBY_WALLETS,
  MAX_PRO_WALLETS,
  MAX_USER_GROUPS,
  MAX_WHALE_WALLETS,
  PRO_PLAN_FEE,
  WHALE_PLAN_FEE,
} from '../../constants/pricing';
import { UserWithSubscriptionPlan } from '../../types/prisma-types';

type SubscriptionPlan = 'FREE' | 'HOBBY' | 'PRO' | 'WHALE';

interface SubscriptionInfo {
  plan: SubscriptionPlan;
  currentPeriodEnd?: Date;
  isActive: boolean;
}

export class SubscriptionMessages {
  private static formatSubscriptionDate(date: Date | undefined): string {
    if (!date) return 'N/A';
    return `${formatDistanceToNow(date, { addSuffix: true })} (${format(date, 'MMM d, yyyy')})`;
  }

  private static getPlanEmoji(plan: SubscriptionPlan): string {
    return plan === 'FREE' ? '😿' : '😺';
  }

  private static formatPlanDetails(maxWallets: number, fee: number): string {
    return `${maxWallets} wallets - ${fee / 1e9} <b>SOL</b> / month`;
  }

  public static upgradeProMessage(user: UserWithSubscriptionPlan | null): string {
    const subscriptionInfo: SubscriptionInfo = {
      plan: user?.userSubscription?.plan ?? 'FREE',
      currentPeriodEnd: user?.userSubscription?.subscriptionCurrentPeriodEnd || undefined,
      isActive: Boolean(user?.userSubscription)
    };

    const formattedDate = this.formatSubscriptionDate(subscriptionInfo.currentPeriodEnd);
    const planEmoji = this.getPlanEmoji(subscriptionInfo.plan);

    const messageText = `
Current plan: ${planEmoji} <b>${subscriptionInfo.plan}</b>
${subscriptionInfo.plan !== 'FREE' ? `<b>Your subscription will renew <u>${formattedDate}</u></b>\n` : ''}
<b>By upgrading to any plan, you can:</b>
✅ Track more wallets to receive more alerts and signals.
✅ Prevent wallet cleanups.
✅ Get access to <b>PREMIUM</b> features.

<b>Choose your plan:</b>
<b>HOBBY</b>: ${this.formatPlanDetails(MAX_HOBBY_WALLETS, HOBBY_PLAN_FEE)}
<b>PRO</b>: ${this.formatPlanDetails(MAX_PRO_WALLETS, PRO_PLAN_FEE)}
<b>WHALE</b>: ${this.formatPlanDetails(MAX_WHALE_WALLETS, WHALE_PLAN_FEE)}

<b>How to upgrade your plan?</b>
1. Transfer the required <b>SOL</b> to your <b>Mud Tracker</b> wallet: <code>${user?.personalWalletPubKey ?? 'Not set'}</code>
2. Now you can select one of the plans below!
`;

    return messageText.trim();
  }

  public static upgradeToProMessage(): string {
    return this.upgradeProMessage(null);
  }

  public static readonly groupChatNotPro = `
🚫 You can only add Mud Tracker to a group if you have a <b>PRO</b> or a <b>WHALE</b> subscription.

You can upgrade your plan directly from our official bot: @${BOT_USERNAME}
`.trim();

  public static readonly userUpgradeGroups = `
To add <b>Mud Tracker</b> to Groups, you need a <b>PRO</b> or <b>WHALE</b> subscription

<b>Click the button below to upgrade your subscription and access to our exclusive features!</b>
`.trim();

  public static readonly userGroupsLimit = `
You’ve reached the maximum limit of groups you can add <b>(${MAX_USER_GROUPS}).</b> 
To add a new group, please remove an existing one.
`.trim();
}
