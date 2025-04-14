import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function getNumberEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

export const env = {
  redis: {
    host: getRequiredEnv('REDIS_HOST'),
    port: getNumberEnv('REDIS_PORT', 6379),
    password: getOptionalEnv('REDIS_PASSWORD', '')
  },
  telegram: {
    botToken: getRequiredEnv('BOT_TOKEN'),
    alertChatId: getRequiredEnv('ALERT_CHAT_ID')
  },
  solana: {
    rpcUrl: getRequiredEnv('SOLANA_RPC_URL'),
    wssUrl: getRequiredEnv('SOLANA_WSS_URL'),
    network: getOptionalEnv('SOLANA_NETWORK', 'mainnet-beta')
  },
  gmgn: {
    apiUrl: getRequiredEnv('GMGN_API_URL'),
    apiKey: getOptionalEnv('GMGN_API_KEY', '')
  },
  prisma: {
    pulseApiKey: getRequiredEnv('PULSE_API_KEY'),
    databaseUrl: getRequiredEnv('NEON_DATABASE_URL')
  }
} as const;
