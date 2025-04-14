export interface TelegramBotMessage {
  message_id: number;
  chat: {
    id: number;
  };
  text?: string;
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  date: number;
}
