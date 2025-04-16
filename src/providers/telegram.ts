import { Telegraf } from 'telegraf'
import dotenv from 'dotenv'

dotenv.config()

const BOT_TOKEN = process.env.BOT_TOKEN
const APP_URL = process.env.APP_URL

// Create a single Telegraf instance
export const bot = new Telegraf(BOT_TOKEN ?? '')

// Setup webhook or polling based on environment
if (process.env.NODE_ENV === 'production' && APP_URL) {
  const WEBHOOK_URL = `${APP_URL}/bot${BOT_TOKEN}`
  
  bot.telegram.setWebhook(WEBHOOK_URL)
    .then(() => {
      console.log(`Webhook set to ${WEBHOOK_URL}`)
    })
    .catch((error) => {
      console.error('Error setting webhook:', error)
    })
} else {
  // Use polling for development
  bot.launch({ polling: true })
    .then(() => {
      console.log('Bot started in polling mode')
    })
    .catch((error) => {
      console.error('Error starting bot in polling mode:', error)
    })
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
