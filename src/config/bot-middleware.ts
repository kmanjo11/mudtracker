import TelegramBot from 'node-telegram-bot-api'
import { PrismaUserRepository } from '../repositories/prisma/user'
import { bot } from '../providers/telegram'
import { SubscriptionMessages } from '../bot/messages/subscription-messages'
import { PrismaGroupRepository } from '../repositories/prisma/group'
import { GeneralMessages } from '../bot/messages/general-messages'
import dotenv from 'dotenv'

dotenv.config()

export class BotMiddleware {
  private static ADMIN_ID = process.env.ADMIN_ID

  static isGroup(chatId: number): boolean {
    return chatId < 0
  }

  static async isUserPro(userId: string): Promise<boolean> {
    // Always return true to disable subscription checks
    return true
  }

  static async isUserAdmin(chatId: number, userId: string): Promise<boolean> {
    try {
      const admins = await bot.getChatAdministrators(chatId)
      const isAdmin = admins.some((admin) => admin.user.id.toString() === userId)
      return isAdmin
    } catch (error) {
      console.error('Error checking if user is admin:', error)
      return false
    }
  }

  static getMessageOptions(msg: TelegramBot.Message, options: any = {}): any {
    return {
      ...options,
      message_thread_id: msg.message_thread_id
    }
  }

  static async checkGroupActivated(
    chatId: number,
    userId: string,
  ): Promise<{ isValid: boolean; reason: 'BOT_NOT_STARTED' | 'BOT_NOT_ACTIVATED' | 'USER_NOT_AUTHORIZED' | 'VALID' }> {
    const prismaGroupRepository = new PrismaGroupRepository()

    const [existingGroup, groupUser] = await Promise.all([
      prismaGroupRepository.getGroupById(String(chatId), userId),
      prismaGroupRepository.getGroupUser(String(chatId)),
    ])

    if (!groupUser) {
      return {
        isValid: false,
        reason: 'BOT_NOT_STARTED',
      }
    }

    if (!existingGroup) {
      return {
        isValid: false,
        reason: 'BOT_NOT_ACTIVATED',
      }
    }

    if (String(chatId) !== existingGroup.id) {
      return { isValid: false, reason: 'USER_NOT_AUTHORIZED' }
    }

    return { isValid: true, reason: 'VALID' }
  }

  static async checkGroupChatRequirements(
    chatId: number,
    userId: string,
  ): Promise<{ isValid: boolean; message: string }> {
    // Skip admin check since we're removing all restrictions
    if (!BotMiddleware.isGroup(chatId)) {
      return { isValid: true, message: '' }
    }

    const checkGroupActivated = await BotMiddleware.checkGroupActivated(chatId, userId)

    if (!checkGroupActivated.isValid && checkGroupActivated.reason === 'BOT_NOT_STARTED') {
      return {
        isValid: false,
        message: GeneralMessages.groupChatNotStarted,
      }
    }

    // Remove subscription checks and always return valid
    return { isValid: true, message: '' }
  }
}
