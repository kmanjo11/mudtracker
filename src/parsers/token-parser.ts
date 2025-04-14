import { Connection, PublicKey, VersionedTransactionResponse } from '@solana/web3.js'
import { Collection, Data, Metadata, TokenStandard, Uses } from '@metaplex-foundation/mpl-token-metadata'
import { RpcConnectionManager } from '../providers/solana'

interface TokenInfo {
  key: string
  updateAuthority: string
  mint: string
  data: Data
  primarySaleHappened: boolean
  isMutable: boolean
  editionNonce: number
  tokenStandard: TokenStandard
  collection: Collection
  uses: Uses
}

export class TokenParser {
  constructor(private connection: Connection) {
    this.connection = connection
  }

  public async getTokenInfo(tokenMint: string): Promise<TokenInfo> {
    const mintPublicKey = new PublicKey(tokenMint)
    const [tokenmetaPubkey] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        mintPublicKey.toBuffer()
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
    )
    const tokenContent = await Metadata.fromAccountAddress(this.connection, tokenmetaPubkey)

    const token = tokenContent.pretty()
    //  console.log('TOKEN', token)

    return token
  }
}
