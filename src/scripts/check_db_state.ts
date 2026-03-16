import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkChat() {
    try {
        const uCount = await prisma.user.count();
        const mCount = await prisma.chatMessage.count();
        console.log(`- User count: ${uCount}`);
        console.log(`- ChatMessage count: ${mCount}`);

        if (mCount > 0) {
            const last = await prisma.chatMessage.findFirst({
                orderBy: { createdAt: 'desc' }
            });
            console.log(`- Latest msg: [${last?.role}] ${last?.content?.substring(0, 30)}...`);
        } else {
            console.log("!!! NO CHAT MESSAGES FOUND IN DB !!!");
        }

    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

checkChat();
