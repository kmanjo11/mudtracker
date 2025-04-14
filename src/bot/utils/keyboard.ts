import { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';

export interface KeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export function createInlineKeyboard(buttons: KeyboardButton[][]): InlineKeyboardMarkup {
  return {
    inline_keyboard: buttons.map(row =>
      row.map(button => {
        // Ensure either callback_data or url is present
        if (!button.callback_data && !button.url) {
          throw new Error('Either callback_data or url must be provided for keyboard button');
        }
        return {
          text: button.text,
          ...(button.callback_data ? { callback_data: button.callback_data } : {}),
          ...(button.url ? { url: button.url } : {})
        } as InlineKeyboardButton
      })
    )
  };
}
