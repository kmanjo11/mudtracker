import { Connection } from '@solana/web3.js'
import dotenv from 'dotenv'

dotenv.config()

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const SOLANA_WSS_URL = process.env.SOLANA_WSS_URL

// I use a separate helius connection to just get the logs cause i found this is the fastest one and will get most of the notifications

// If you are going to use Handi Cat locally you can just use SOLANA_NETWORK for all connections
// and will work fine as long you dont track too many wallets
export class RpcConnectionManager {
  static connections = [
    new Connection(SOLANA_RPC_URL, {
      commitment: 'confirmed',
      wsEndpoint: SOLANA_WSS_URL
    }),
    new Connection(SOLANA_RPC_URL, {
      commitment: 'confirmed',
      wsEndpoint: SOLANA_WSS_URL
    })
  ]

  static logConnection = new Connection(SOLANA_RPC_URL, {
    commitment: 'processed',
    wsEndpoint: SOLANA_WSS_URL
  })

  static getRandomConnection(): Connection {
    const randomIndex = Math.floor(Math.random() * RpcConnectionManager.connections.length)
    return RpcConnectionManager.connections[randomIndex]
  }

  static getWebSocketConnection(): Connection {
    return new Connection(SOLANA_RPC_URL, {
      commitment: 'confirmed',
      wsEndpoint: SOLANA_WSS_URL
    })
  }
}
