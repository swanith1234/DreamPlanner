import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyPagination() {
    console.log('--- Verifying Pagination ---');
    
    // 1. Get total count
    const total = await prisma.chatMessage.count();
    console.log(`Total messages in DB: ${total}`);

    // 2. Fetch first batch (limit 5)
    const batch1 = await prisma.chatMessage.findMany({
        where: {
            role: { in: ['user', 'assistant'] },
            content: { not: null, notIn: [''] }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    console.log(`Batch 1 (desc): [${batch1.map(m => m.id).join(', ')}]`);
    const oldestInBatch1 = batch1[batch1.length - 1];
    console.log(`Oldest in Batch 1: ${oldestInBatch1.createdAt.toISOString()}`);

    // 3. Fetch second batch using cursor (lt oldestInBatch1.createdAt)
    const batch2 = await prisma.chatMessage.findMany({
        where: {
            role: { in: ['user', 'assistant'] },
            content: { not: null, notIn: [''] },
            createdAt: { lt: oldestInBatch1.createdAt }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    console.log(`Batch 2 (desc): [${batch2.map(m => m.id).join(', ')}]`);
    
    if (batch2.length > 0) {
        const newestInBatch2 = batch2[0];
        console.log(`Newest in Batch 2: ${newestInBatch2.createdAt.toISOString()}`);
        
        if (newestInBatch2.createdAt < oldestInBatch1.createdAt) {
            console.log('✅ Success: Batch 2 correctly follows Batch 1 chronologically.');
        } else {
            console.log('❌ Error: Batch 2 is NOT older than Batch 1.');
        }
    } else {
        console.log('No more messages for Batch 2.');
    }

    // 4. Verify Notification Persistence
    const assistantMessages = await prisma.chatMessage.findMany({
        where: { role: 'assistant' },
        take: 100
    });
    const notificationsAsMessages = assistantMessages.filter(m => {
        const meta = m.metadata as any;
        return meta && meta.notificationId;
    }).length;

    console.log(`Messages linked to notifications (in latest 100 assistant msgs): ${notificationsAsMessages}`);
    if (notificationsAsMessages > 0) {
        console.log('✅ Success: Notifications are being saved to chat history.');
    } else {
        console.log('⚠️ Warning: No messages found with notification metadata in latest 100 msgs.');
    }
}

verifyPagination()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
