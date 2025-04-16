import { User } from '@prisma/client'
import { UserBalances } from '../../lib/user-balances'
import { TokenService } from '../../services/wallet/token-service'
import { Connection } from '@solana/web3.js'
import { RpcConnectionManager } from '../../providers/solana'
import { formatNumber } from '../../utils/format'

export class WalletMessages {
  private userBalances: UserBalances
  private tokenService: TokenService
  
  constructor() {
    this.userBalances = new UserBalances()
    this.tokenService = new TokenService(RpcConnectionManager.connections[0])
  }

  static addWalletMessage: string = `
💩 Ok, just send me a wallet address to track:

You can also give that wallet a name by following the address with the desired name, or add multiple wallets at once by sending them each on a new line for example: 

walletAddress1 walletName1
walletAddress2 walletName2
`

  static deleteWalletMessage: string = `
Send me the wallet address you want to remove 🗑️

You can also delete multiple wallets at once if you send them each on a new line, for example:

walletAddress1
walletAddress2
`

  public async sendMyWalletMessage(
    wallet: Pick<User, 'personalWalletPrivKey' | 'personalWalletPubKey'>,
  ): Promise<string> {
    try {
      // Get token balances with prices
      const tokenBalances = await this.tokenService.getTokenBalancesWithPrices(wallet.personalWalletPubKey)
      
      // Calculate total portfolio value
      const portfolioValue = this.tokenService.calculatePortfolioValue(tokenBalances)
      
      // Start building the response
      let responseText = `
<b>🏦 Your Wallet</b>

<b>Address:</b> 
<code>${wallet.personalWalletPubKey}</code>

<b>💰 Total Value:</b> $${formatNumber(portfolioValue, 2)}

<b>Token Holdings:</b>
`
      
      // Add token balances
      if (tokenBalances.length === 0) {
        responseText += "\nNo tokens found in this wallet."
      } else {
        // Sort tokens by value (highest first)
        const sortedBalances = [...tokenBalances].sort((a, b) => (b.value || 0) - (a.value || 0))
        
        for (const balance of sortedBalances) {
          const valueStr = balance.value ? `$${formatNumber(balance.value, 2)}` : 'N/A'
          responseText += `\n• <b>${balance.symbol}</b>: ${formatNumber(balance.uiAmount, 6)} (${valueStr})`
        }
      }
      
      // Add transaction history note
      responseText += `\n\n<b>Recent Activity:</b>\nUse the buttons below to view recent transactions and manage your wallet.`
      
      return responseText
    } catch (error) {
      console.error('Error generating wallet message:', error)
      
      // Fallback to basic message if there's an error
      const solBalance = await this.userBalances.userPersonalSolBalance(wallet.personalWalletPubKey)
      
      return `
<b>Your wallet address:</b> 
<code>${wallet.personalWalletPubKey}</code>

<b>SOL:</b> ${solBalance ? solBalance / 1e9 : 0}
`
    }
  }
  
  public async sendWalletTransactionsMessage(walletAddress: string): Promise<string> {
    try {
      // In a real implementation, this would fetch actual transaction history
      // For now, return a placeholder message
      return `
<b>Recent Transactions</b>
<code>${walletAddress}</code>

• Swap: 0.5 SOL → 10.2 USDC (2 mins ago)
• Received: 1.2 SOL from Dz7TUk... (1 hour ago)
• Swap: 5 USDC → 0.25 SOL (3 hours ago)
• Liquidity Add: 0.5 SOL + 10 USDC (1 day ago)
• Sent: 0.1 SOL to 8xDrt... (2 days ago)
`
    } catch (error) {
      console.error('Error generating transactions message:', error)
      return `<b>Could not load transactions for wallet:</b>\n<code>${walletAddress}</code>`
    }
  }
  
  public async sendTokenDetailsMessage(walletAddress: string, tokenMint: string): Promise<string> {
    try {
      // Get token info
      const tokenBalances = await this.tokenService.getTokenBalances(walletAddress)
      const tokenBalance = tokenBalances.find(b => b.mint === tokenMint)
      
      if (!tokenBalance) {
        return `<b>Token not found in wallet:</b>\n<code>${tokenMint}</code>`
      }
      
      // Get price info
      const balancesWithPrices = await this.tokenService.getTokenPrices([tokenBalance])
      const tokenWithPrice = balancesWithPrices[0]
      
      return `
<b>${tokenWithPrice.name} (${tokenWithPrice.symbol})</b>

<b>Balance:</b> ${formatNumber(tokenWithPrice.uiAmount, 6)} ${tokenWithPrice.symbol}
<b>Value:</b> ${tokenWithPrice.value ? '$' + formatNumber(tokenWithPrice.value, 2) : 'N/A'}
<b>Price:</b> ${tokenWithPrice.price ? '$' + formatNumber(tokenWithPrice.price, 6) : 'N/A'}
<b>Token Address:</b> 
<code>${tokenWithPrice.mint}</code>

Use the buttons below to trade this token.
`
    } catch (error) {
      console.error('Error generating token details message:', error)
      return `<b>Could not load details for token:</b>\n<code>${tokenMint}</code>`
    }
  }
}
