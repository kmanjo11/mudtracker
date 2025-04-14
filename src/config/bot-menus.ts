import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import { HOBBY_PLAN_FEE, PRO_PLAN_FEE, WHALE_PLAN_FEE } from '../constants/pricing'
import { HandiCatStatus } from '@prisma/client'
import { text } from 'stream/consumers'

export const START_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '👛 Tracker', callback_data: 'manage' },
      { text: '👛 My Wallet', callback_data: 'my_wallet' },
    ],
    [
      { text: '🔌 👻 Connect', callback_data: 'connect_wallet' },
      { text: '🔍 Scanner', callback_data: 'scanner' },
    ],
    [
      { text: '💹 Trade', callback_data: 'trade' },
      { text: '📊 Charts', callback_data: 'charts' },
    ],
    [
      { text: '⚙️ Settings', callback_data: 'settings' },
      { text: '🔎 Help', callback_data: 'help' },
    ],
    [
      { text: '👑 Upgrade', callback_data: 'upgrade' },
      { text: '❤️ Donate', callback_data: 'donate' },
    ],
  ],
}

export const SUB_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const USER_WALLET_SUB_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '🔑 Show private key', callback_data: 'show_private_key' }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const MANAGE_SUB_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '🔮 Add', callback_data: 'add' },
     { text: '🗑️ Delete', callback_data: 'delete' }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const TRADE_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '🔄 Spot Trade', callback_data: 'spot_trade' }],
    [{ text: '📈 Leverage Trade', callback_data: 'leverage_trade' }],
    [{ text: '💧 Liquidity Pool', callback_data: 'liquidity_pool' }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const GROUPS_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '➕ Create Group', callback_data: 'create_group' }],
    [{ text: '👥 Join Group', callback_data: 'join_group' }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const createTxSubMenu = (tokenSymbol: string, tokenMint: string) => {
  const txSubMenu: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        {
          text: `👻 Buy on Phantom: ${tokenSymbol}`,
          url: `https://phantom.app/ul/swap?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenMint}`,
        },
      ],
      [
        { text: `🐂 Buy on BullX: ${tokenSymbol}`, url: `https://t.me/BullxBetaBot?start=access_D8R3ROA7GAV` },
        {
          text: `🐸 PepeBoost: ${tokenSymbol}`,
          url: `https://t.me/pepeboost_sol_bot?start=ref_03pbvu_ca_${tokenMint}`,
        },
      ],
      [
        {
          text: `🦖 GMGN: ${tokenSymbol}`,
          url: `https://t.me/GMGN_sol_bot?start=i_kxPdcLKf_c_${tokenMint}`,
        },
      ],
    ],
  }

  return txSubMenu
}

export const UPGRADE_PLAN_SUB_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{
      text: `BUY HOBBY ${HOBBY_PLAN_FEE / 1e9} SOL/m`,
      callback_data: 'upgrade_hobby',
    }],
    [{
      text: `BUY PRO ${PRO_PLAN_FEE / 1e9} SOL/m`,
      callback_data: 'upgrade_pro',
    }],
    [{
      text: `BUY WHALE ${WHALE_PLAN_FEE / 1e9} SOL/m`,
      callback_data: 'upgrade_whale',
    }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const DONATE_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: `❤️ ${0.1} SOL`, callback_data: 'donate_action_0.1' }],
    [{ text: `✨ ${0.25} SOL`, callback_data: 'donate_action_0.5' }],
    [{ text: `💪 ${.50} SOL`, callback_data: 'donate_action_1.0' }],
    [{ text: `🗿 ${1.0} SOL`, callback_data: 'donate_action_5.0' }],
    [{ text: `🔥 ${3.0} SOL`, callback_data: 'donate_action_10.0' }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const SUGGEST_UPGRADE_SUBMENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '👑 Upgrade', callback_data: 'upgrade' }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const INSUFFICIENT_BALANCE_SUB_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '💩 Your Mud Tracker Wallet', callback_data: 'my_wallet' }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const USER_SETTINGS_MENU = (botStatus: HandiCatStatus): InlineKeyboardMarkup => {
  return {
    inline_keyboard: [
      [
        {
          text: `${botStatus === 'ACTIVE' ? '⏸️ Pause Mud Tracker' : '▶️ Resume Mud Tracker'}`,
          callback_data: 'pause-resume-bot',
        },
      ],
      [{ text: '🔙 Back', callback_data: 'back_to_main' }]
    ]
  }
}

export const WALLET_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '🔌 👻 Connect Phantom', callback_data: 'connect_phantom' },
      { text: '💼 Use System Wallet', callback_data: 'use_system_wallet' },
    ],
    [
      { text: '🔄 Switch Wallet', callback_data: 'switch_wallet' },
      { text: '👁 View Active', callback_data: 'view_active_wallet' },
    ],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}

export const DELETE_SUB_MENU: InlineKeyboardMarkup = {
  inline_keyboard: [
    [{ text: '❌ Confirm Delete', callback_data: 'confirm_delete' }],
    [{ text: '🔙 Back', callback_data: 'back_to_main' }]
  ]
}
