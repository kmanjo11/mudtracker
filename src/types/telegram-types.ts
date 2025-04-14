import { EditMessageTextOptions } from 'node-telegram-bot-api'
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types'

interface ExtendedEditMessageTextOptions extends EditMessageTextOptions {
  message_thread_id?: number
}

interface ExtendedReplyOptions extends Partial<ExtraReplyMessage> {
  parse_mode?: 'Markdown' | 'HTML';
  disable_web_page_preview?: boolean;
  reply_markup?: any;
}

export { ExtendedEditMessageTextOptions, ExtendedReplyOptions }
