import { PrismaClient, SubscriptionPlan } from '@prisma/client'
import dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function addProSubscription() {
  const userId = process.env.ADMIN_ID
  if (!userId) {
    console.error('ADMIN_ID not found in .env')
    return
  }

  try {
    // First ensure the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userSubscription: true }
    })

    if (!user) {
      // Create user if doesn't exist
      await prisma.user.create({
        data: {
          id: userId,
          username: 'admin',
          firstName: 'Admin',
          lastName: 'User',
          personalWalletPubKey: 'admin',
          personalWalletPrivKey: 'admin',
        }
      })
    }

    // Add or update subscription to PRO
    const oneYearFromNow = new Date()
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)

    if (user?.userSubscription) {
      // Update existing subscription
      await prisma.userSubscription.update({
        where: { userId },
        data: {
          plan: SubscriptionPlan.PRO,
          isCanceled: false,
          subscriptionCurrentPeriodEnd: oneYearFromNow
        }
      })
    } else {
      // Create new subscription
      await prisma.userSubscription.create({
        data: {
          userId,
          plan: SubscriptionPlan.PRO,
          isCanceled: false,
          subscriptionCurrentPeriodEnd: oneYearFromNow
        }
      })
    }

    console.log('Successfully added PRO subscription for admin user')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

addProSubscription()
