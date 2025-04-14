import { PrismaClient } from '@prisma/client';
import { withPulse } from '@prisma/extension-pulse';
import { env } from '../utils/env';

const prisma = new PrismaClient().$extends(withPulse({ apiKey: env.prisma.pulseApiKey }));

export default prisma;
