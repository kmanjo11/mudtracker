import { SubscriptionPlan } from '@prisma/client'
import {
  MAX_FREE_WALLETS,
  MAX_HOBBY_WALLETS,
  MAX_PRO_WALLETS,
  MAX_USER_GROUPS,
  MAX_WHALE_WALLETS,
} from '../../constants/pricing'
import { UserPlan } from '../../lib/user-plan'
import { UserPrisma } from '../../types/prisma-types'
import { UserGroup } from '../../types/general-interfaces'

export class GeneralMessages {
  constructor() {}
  static getSuccessMessage(): string {
    return 'Operation completed successfully.';
  }
  static startMessage(user: UserPrisma): string {
    const plan = user?.userSubscription?.plan || 'FREE'

    const planWallets: { [key: string]: number } = {
      FREE: MAX_FREE_WALLETS,
      HOBBY: MAX_HOBBY_WALLETS,
      PRO: MAX_PRO_WALLETS,
      WHALE: MAX_WHALE_WALLETS,
    }

    const messageText = `
💩 MUD Bros. | Wallet Tracker

 A Wallet Tracker for the Muddies.

You are currently lurking <b>${user?._count.userWallets || 0} / ${planWallets[plan]} wallets</b> ✨

🆙 Click the <b>Upgrade</b> button to unlock more wallet features! 

⚠️ <b>Note for Users:</b>  
To ensure smooth performance for everyone, im still working on this code.  🚀
`

    return messageText
  }

  static startMessageGroup = `
 💩 MUD Bros. | Wallet Tracker

 A Wallet Tracker for the Muddies.

<b>These are the commands available:</b>
- /add Add a new wallet
- /delete Delete a wallet
- /manage View all wallets
`

  static planUpgradedMessage(plan: SubscriptionPlan, subscriptionEnd: string): string {
    const planWallets: { [key: string]: number } = {
      HOBBY: MAX_HOBBY_WALLETS,
      PRO: MAX_PRO_WALLETS,
      WHALE: MAX_WHALE_WALLETS,
    }

    const planWallet = planWallets[plan]

    const messageText = `
💩 Success! Your plan has been upgraded to <b>${plan}</b>.
Your subscription will renew at ${subscriptionEnd}

You can now track up to <b>${planWallet}</b> wallets at the time!
`

    return messageText
  }

  static insufficientBalanceMessage: string = `
💩 Ooops it seems that you don't have sufficient balance to perform this transaction.

You can try by adding some <b>SOL</b> to your MUD personal wallet 💩
`

  static userAlreadyPaidMessage(action: 'CODE' | 'PLAN'): string {
    const messageText = `
🤝 You already purchased this ${action.toLowerCase()} 
`

    return messageText
  }

  static walletLimitMessageError(walletName: string | undefined, walletAddress: string, planWallets: number): string {
    const messageText = `
💩 Could not add wallet: <code>${walletName ? walletName : walletAddress}</code>, 

Wallet limit reached: <b>${planWallets}</b>

You can try by upgrading your <b>plan</b> for more wallets 💎
`

    return messageText
  }

  static generalMessageError: string = `
💩 Ooops it seems that something went wrong while processing the transaction.

You probaly don't have sufficient balance in your wallet or it can't cover the transaction fees.

Maybe try adding some <b>SOL</b> to your Mud personal wallet 💩
`

  static botWalletError: string = `
💩 Oops! it seems that this wallet is spamming to many tps, Please enter another wallet or try again later.
`

  static groupsMessage(userGroups: UserGroup[]) {
    const groupsContent =
      userGroups.length === 0
        ? `     
<i>You do not have any groups yet.</i>
`
        : userGroups
            .map(
              (group, i) => `
✅ Group Name: <b>${group.name}</b>
🔗 Group ID: <code>${group.id}</code>

`,
            )
            .join('\n\n')

    const messageText = `
You can now use <b>Mud Tracker</b> in any group chat!

Your groups: (${userGroups.length} / ${MAX_USER_GROUPS})
${groupsContent}
Learn how to add <b>Mud Tracker</b> to a group chat in the <b>Help</b> menu
`
    return messageText
  }

  static groupChatNotStarted = `
🚫 You cannot change Mud Tracker settings in this group

Bot is not initiated. Send /start
`

  static groupChatNotActivated = `
🚫 You cannot change Mud Tracker settings in this group

Bot is not activated. Send /activate
`

  static userNotAuthorizedInGroup = `
🚫 You cannot change Mud Tracker settings in this group

you are not authorized to perform this action.
`

  static deleteGroupMessage = `
To <b>remove</b> a group from your list, simply send me the <u>Group ID</u> of the group you'd like to delete.
`

  static groupDeletedMessage = `
This group has been deleted from your list!
`
  static failedToDeleteGroupMessage = `
Failed to delete group, make sure you provided a valid <b>Group ID</b>
`
}
