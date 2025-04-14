// this class is no longer being used, im using walletWatcher.isRelevantTransaction instead

import { PublicKey } from '@solana/web3.js'
import { SwapPlatform, SwapType } from '../types/swap-types'
import {
  JUPITER_PROGRAM_ID,
  PUMP_FUN_PROGRAM_ID,
  PUMP_FUN_TOKEN_MINT_AUTH,
  RAYDIUM_PROGRAM_ID,
} from '../config/program-ids'

export class ValidTransactions {
  constructor(private programIds: any) {
    this.programIds = programIds
  }

  public getDefiTransaction(): { valid: boolean; swap: SwapType } {
    const pumpFunProgramId = new PublicKey(PUMP_FUN_PROGRAM_ID)
    const raydiumProgramId = new PublicKey(RAYDIUM_PROGRAM_ID)
    const jupiterProgramId = new PublicKey(JUPITER_PROGRAM_ID)
    const pumpFunTokenMintAuth = new PublicKey(PUMP_FUN_TOKEN_MINT_AUTH)

    const pumpFunTransaction = this.programIds && this.programIds.some((id: any) => id.equals(pumpFunProgramId))
    const raydiumTransaction = this.programIds && this.programIds.some((id: any) => id.equals(raydiumProgramId))
    const jupiterTransaction = this.programIds && this.programIds.some((id: any) => id.equals(jupiterProgramId))
    const pumpFunMinted = this.programIds && this.programIds.some((id: any) => id.equals(pumpFunTokenMintAuth))

    if (pumpFunMinted) {
      console.log('detected token mint transaction')
      return { valid: true, swap: SwapPlatform.MINT_PUMPFUN }
    } else if (pumpFunTransaction) {
      console.log('detected pumpfun transaction')
      return { valid: true, swap: SwapPlatform.PUMPFUN }
    } else if (jupiterTransaction) {
      console.log('detected jupiter transaction')
      return { valid: true, swap: SwapPlatform.JUPITER }
    } else if (raydiumTransaction) {
      console.log('detected raydium transaction')
      return { valid: true, swap: SwapPlatform.RAYDIUM }
    } else {
      return { valid: false, swap: null }
    }
  }
}
