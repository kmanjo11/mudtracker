import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import axios from 'axios';

export class JupiterProvider {
  private readonly API_BASE = 'https://quote-api.jup.ag/v6';

  constructor(private connection: Connection) {}

  async getBestRoute(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippage: number = 1
  ): Promise<{ instructions: TransactionInstruction[]; outputAmount: number }> {
    try {
      const response = await axios.get(`${this.API_BASE}/quote`, {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps: slippage * 100
        }
      });

      const { data } = response;
      return {
        instructions: data.instructions.map((ix: any) => {
          return new TransactionInstruction({
            programId: new PublicKey(ix.programId),
            keys: ix.accounts.map((acc: any) => ({
              pubkey: new PublicKey(acc.pubkey),
              isSigner: acc.isSigner,
              isWritable: acc.isWritable
            })),
            data: Buffer.from(ix.data, 'base64')
          });
        }),
        outputAmount: data.outAmount
      };
    } catch (error) {
      console.error('Error getting Jupiter route:', error);
      throw error;
    }
  }

  async createTransactionInstructions(route: any): Promise<TransactionInstruction[]> {
    try {
      const response = await axios.post(`${this.API_BASE}/swap`, {
        route,
        userPublicKey: route.userPublicKey,
        wrapUnwrapSOL: true
      });

      const { swapTransaction } = response.data;
      
      // Decode and return instructions
      return swapTransaction.instructions.map((ix: any) => {
        return new TransactionInstruction({
          programId: new PublicKey(ix.programId),
          keys: ix.accounts.map((acc: any) => ({
            pubkey: new PublicKey(acc.pubkey),
            isSigner: acc.isSigner,
            isWritable: acc.isWritable
          })),
          data: Buffer.from(ix.data, 'base64')
        });
      });
    } catch (error) {
      console.error('Error creating transaction:', error);
      throw error;
    }
  }
}
