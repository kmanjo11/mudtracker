import { InlineKeyboardButton } from 'telegraf/types';

interface WelcomeMessage {
  text: string;
  keyboard: InlineKeyboardButton[][];
}

export const welcomeMessage: WelcomeMessage = {
  text: `👋 Welcome to Mud Tracker! 💩

🔍 I can help you:
• Track wallet transactions
• Autopilot Trading
• Smart Fund Allocation
• Leverage & Liquidity Pool Trading
• View trading history
• Analyze market trends

Connect your Phantom wallet or use our system wallet to:
• Allocate funds for trading
• Manage leverage positions
• Participate in liquidity pools
• Track your portfolio

Get started by choosing an option below:`,
  keyboard: [
    [{ text: '👛 Tracker', callback_data: 'manage' }, { text: '👛 My Wallet', callback_data: 'my_wallet' }],
    [{ text: '🔌 👻 Connect', callback_data: 'connect_wallet' }, { text: '📊 Charts', callback_data: 'charts' }],
    [{ text: '💹 Trade', callback_data: 'trade' }, { text: '🔍 Scanner', callback_data: 'scanner' }],
    [{ text: '⚙️ Settings', callback_data: 'settings' }, { text: '🔎 Help', callback_data: 'help' }],
    [{ text: '👑 Upgrade', callback_data: 'upgrade' }, { text: '❤️ Donate', callback_data: 'donate' }]
  ]
};
