import TelegramBot from 'node-telegram-bot-api'
import { Context } from 'telegraf'
import { Update } from 'telegraf/typings/core/types/typegram'
import { SubscriptionMessages } from '../messages/subscription-messages'
import { GROUPS_MENU, SUB_MENU } from '../../config/bot-menus'
import { BotMiddleware } from '../../config/bot-middleware'
import { GeneralMessages } from '../messages/general-messages'
import { PrismaGroupRepository } from '../../repositories/prisma/group'
import { PrismaUserRepository } from '../../repositories/prisma/user'
import { UserGroup } from '../../types/general-interfaces'
import { Command } from '../types'

export class GroupsCommand implements Command {
  private prismaGroupRepository: PrismaGroupRepository
  private prismaUserRepository: PrismaUserRepository

  readonly name = 'groups'
  readonly description = 'Manage your groups'

  constructor(private bot: TelegramBot) {
    this.bot = bot
    this.prismaGroupRepository = new PrismaGroupRepository()
    this.prismaUserRepository = new PrismaUserRepository()
  }

  async execute(ctx: Context<Update>): Promise<void> {
    const userId = ctx.from?.id.toString()
    if (!userId) return

    const isUserPro = await BotMiddleware.isUserPro(userId)

    if (isUserPro) {
      const allUserGroups = await this.prismaGroupRepository.getAllUserGroups(userId)
      const groups: UserGroup[] = (allUserGroups || []).map(group => ({
        id: group.id,
        name: group.name,
        ownerId: group.userId,
        members: (group.members || []).map((member: { userId: string }) => member.userId),
        createdAt: group.createdAt,
        settings: {
          notifications: Boolean(group.notifications),
          autoAccept: Boolean(group.autoAccept),
          minWalletAge: Number(group.minWalletAge || 0)
        }
      }))

      if (ctx.callbackQuery) {
        await ctx.editMessageText(GeneralMessages.groupsMessage(groups), {
          parse_mode: 'HTML',
          reply_markup: GROUPS_MENU
        })
      } else {
        await ctx.reply(GeneralMessages.groupsMessage(groups), {
          parse_mode: 'HTML',
          reply_markup: GROUPS_MENU
        })
      }
    } else {
      const messageText = SubscriptionMessages.upgradeToProMessage()
      if (ctx.callbackQuery) {
        await ctx.editMessageText(messageText, {
          parse_mode: 'HTML',
          reply_markup: SUB_MENU
        })
      } else {
        await ctx.reply(messageText, {
          parse_mode: 'HTML',
          reply_markup: SUB_MENU
        })
      }
    }
  }

  async handleCallback(ctx: Context<Update>): Promise<void> {
    await this.execute(ctx)
  }
}
