declare module '@raydium-io/raydium-sdk-v2' {
    import { Connection } from '@solana/web3.js';

    export interface LiquidityPoolInfo {
        // Add any properties that your code uses from pool info
        [key: string]: any;
    }

    export class Liquidity {
        static makeAddLiquidityInstructionSimple(params: {
            connection: Connection;
            poolInfo: LiquidityPoolInfo;
            userTokenA: any;
            userTokenB: any;
            fixedSide: 'a' | 'b';
        }): Promise<any>;

        static makeRemoveLiquidityInstructionSimple(params: {
            connection: Connection;
            poolInfo: LiquidityPoolInfo;
            userLpToken: any;
        }): Promise<any>;
    }
}
