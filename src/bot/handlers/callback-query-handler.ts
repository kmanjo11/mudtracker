import { Telegraf, Context } from 'telegraf'
import { CallbackQuery } from 'telegraf/typings/core/types/typegram'
import { Message } from 'node-telegram-bot-api'
import { AddCommand } from '../commands/add-command'
import { START_MENU } from '../../config/bot-menus'
import { TrackerCommand } from '../commands/manage-command'
import { DeleteCommand } from '../commands/delete-command'
import { userExpectingDonation, userExpectingGroupId, userExpectingWalletAddress } from '../../constants/flags'
import { MyWalletCommand } from '../commands/mywallet-command'
import { GeneralMessages } from '../messages/general-messages'
import { UpgradePlanCommand } from '../commands/upgrade-plan-command'
import { UpgradePlanHandler } from './upgrade-plan-handler'
import { DonateCommand } from '../commands/donate-command'
import { DonateHandler } from './donate-handler'
import { SettingsCommand } from '../commands/settings-command'
import { UpdateBotStatusHandler } from './update-bot-status-handler'
import { PromotionHandler } from './promotion-handler'
import { GET_50_WALLETS_PROMOTION } from '../../constants/promotions'
import { PrismaUserRepository } from '../../repositories/prisma/user'
import { GroupsCommand } from '../commands/groups-command'
import { HelpCommand } from '../commands/help-command'
import { UserSettingsService } from '../../services/user/user-settings-service'
import { TelegrafAdapter } from '../adapters/telegram-adapter'
import { TokenScanner } from '../../services/scanner/token-scanner'
import { UserPreferences } from '../../services/user/user-preferences'
import { ChatManager } from '../../services/chat/chat-manager'
import { ScannerCommand } from '../commands/scanner-command'
import { WalletService } from '../../services/wallet/wallet-service'
import { RpcConnectionManager } from '../../providers/solana'
import { ConnectWalletCommand } from '../commands/connect-wallet-command'
import { NitterService } from '../../services/social/nitter-service'
import { GmgnService } from '../../services/analytics/gmgn-service'
import { TradeCommand } from '../commands/trade-command'
import { TradingService } from '../../services/trading/trading-service'
import { ChartUICommand } from '../commands/chart-ui-command'
import { DexTradeService } from '../../services/analytics/dex-trade-service'
import { ChartService } from '../../services/analytics/chart-service'

export class CallbackQueryHandler {
  private addCommand: AddCommand
  private manageCommand: TrackerCommand
  private deleteCommand: DeleteCommand
  private myWalletCommand: MyWalletCommand
  private upgradePlanCommand: UpgradePlanCommand
  private tradeCommand: TradeCommand
  private donateCommand: DonateCommand
  private settingsCommand: SettingsCommand
  private groupsCommand: GroupsCommand
  private helpCommand: HelpCommand

  private updateBotStatusHandler: UpdateBotStatusHandler
  private prismaUserRepository: PrismaUserRepository
  private upgradePlanHandler: UpgradePlanHandler
  private donateHandler: DonateHandler
  private promotionHandler: PromotionHandler
  private adapter: TelegrafAdapter

  private chartUICommand: ChartUICommand

  constructor(private bot: Telegraf<Context>, private userSettings: UserSettingsService) {
    this.adapter = new TelegrafAdapter(bot)
    this.adapter = new TelegrafAdapter(bot)
    const adaptedBot = this.adapter.getAdapter()

    // Initialize all commands with adapted bot
    this.addCommand = new AddCommand(adaptedBot)
    this.manageCommand = new TrackerCommand(adaptedBot)
    this.deleteCommand = new DeleteCommand(adaptedBot)
    this.myWalletCommand = new MyWalletCommand(adaptedBot)
    this.upgradePlanCommand = new UpgradePlanCommand(adaptedBot)
    this.donateCommand = new DonateCommand(adaptedBot)
    this.settingsCommand = new SettingsCommand(adaptedBot, this.userSettings, new ChatManager())
    this.groupsCommand = new GroupsCommand(adaptedBot)
    this.helpCommand = new HelpCommand(adaptedBot)
    this.tradeCommand = new TradeCommand(adaptedBot, new TradingService(RpcConnectionManager.getRandomConnection()))
    const chartService = new ChartService(new DexTradeService());
    this.chartUICommand = new ChartUICommand(adaptedBot, chartService)

    // Initialize handlers with adapted bot
    this.prismaUserRepository = new PrismaUserRepository()
    this.upgradePlanHandler = new UpgradePlanHandler(adaptedBot)
    this.donateHandler = new DonateHandler(adaptedBot)
    this.updateBotStatusHandler = new UpdateBotStatusHandler(adaptedBot)
    this.promotionHandler = new PromotionHandler(adaptedBot)
  }

  public async call() {
    this.bot.on('callback_query', async (ctx) => {
      try {
        const callbackQuery = ctx.callbackQuery as CallbackQuery
        if (!('data' in callbackQuery) || !callbackQuery.data) return;

        const data = (callbackQuery as any).data
        const message = callbackQuery.message as unknown as Message

        if (!message) return

        const chatId = message.chat.id

        if (data.startsWith('donate_')) {
          const donationAmount = data.split('_')[1]
          await this.donateHandler.makeDonation(message, Number(donationAmount))
          return
        }

        switch (data) {
          case 'charts':
          case 'search_token':
          case 'refresh_chart':
          case 'buy_token':
          case 'sell_token':
          case 'limit_order':
          case 'swap_token':
          case 'back_to_chart':
          case 'buy_gmgn':
          case 'sell_gmgn':
          case 'swap_gmgn':
            await this.chartUICommand.handleCallback(ctx);
            break;
          case 'trade':
          case 'spot_trading':
          case 'leverage_trading':
          case 'liquidity_pool':
          case 'new_spot_order':
          case 'view_spot_orders':
          case 'new_leverage_position':
          case 'view_leverage_positions':
          case 'add_liquidity':
          case 'remove_liquidity':
            await this.tradeCommand.handleCallback(ctx);
            break;
          case 'add':
            await this.addCommand.execute(ctx)
            break
          case 'manage':
            await this.manageCommand.execute(ctx)
            break
          case 'delete':
            await this.deleteCommand.execute(ctx)
            break
          case 'settings':
            await this.settingsCommand.execute(ctx)
            break
          case 'scanner':
            const tokenScanner = new TokenScanner(
              RpcConnectionManager.getRandomConnection(),
              new NitterService(),
              new GmgnService(RpcConnectionManager.getRandomConnection()),
              new ChatManager(),
              this.bot
            )
            const userPrefs = new UserPreferences()
            const chatManager = new ChatManager()
            const scannerCommand = new ScannerCommand(this.bot, tokenScanner, userPrefs, chatManager)
            await scannerCommand.execute(ctx)
            break
          case 'connect_wallet':
            const walletService = new WalletService(RpcConnectionManager.getRandomConnection())
            const connectCommand = new ConnectWalletCommand(this.bot, walletService)
            await connectCommand.execute(ctx)
            break
          case 'pause_resume':
            await this.updateBotStatusHandler.pauseResumeBot(message)
            break
          case 'upgrade_plan':
            await this.upgradePlanCommand.execute(ctx)
            break
          case 'hobby_plan':
            await this.upgradePlanHandler.upgradePlan(message, 'HOBBY')
            break
          case 'pro_plan':
            await this.upgradePlanHandler.upgradePlan(message, 'PRO')
            break
          case 'whale_plan':
            await this.upgradePlanHandler.upgradePlan(message, 'WHALE')
            break
          case 'donate':
            await this.donateCommand.execute(ctx)
            break
          case 'groups':
            await this.groupsCommand.execute(ctx)
            break
          case 'delete_group':
            await this.groupsCommand.execute(ctx)
            break
          case 'help':
            await this.helpCommand.execute(ctx)
            break
          case 'my_wallet':
            await this.myWalletCommand.execute(ctx)
            break
          case 'show_private_key':
            await this.myWalletCommand.execute(ctx)
            break
          case 'get_50_wallets':
            await this.promotionHandler.buyPromotion(message, GET_50_WALLETS_PROMOTION.price, GET_50_WALLETS_PROMOTION.type)
            break
          case 'back_to_main':
          case 'back_to_main_menu':
          case 'back':
            const user = await this.prismaUserRepository.getById(chatId.toString())
            const messageText = GeneralMessages.startMessage(user)

            // reset any flags
            userExpectingWalletAddress[chatId] = false
            userExpectingDonation[chatId] = false
            userExpectingGroupId[chatId] = false

            await this.adapter.editMessageText(messageText, {
              chat_id: chatId,
              message_id: message.message_id,
              reply_markup: START_MENU,
              parse_mode: 'HTML'
            })
            break
          case 'upgrade':
            await this.upgradePlanCommand.execute(ctx)
            break
          default:
            await ctx.answerCbQuery('Unknown command')
            break
        }

        // Reset user flags
        userExpectingWalletAddress[chatId] = false
        userExpectingDonation[chatId] = false
        userExpectingGroupId[chatId] = false

        // Answer callback query to remove loading state
        await ctx.answerCbQuery()
      } catch (error) {
        console.error('Error handling callback query:', error)
      }
    })
  }
}
