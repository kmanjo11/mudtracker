import { Context } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';

export interface Command {
  name: string;
  description: string;
  execute(ctx: Context<Update>): Promise<void>;
  handleCallback?(ctx: Context<Update>): Promise<void>;
}
