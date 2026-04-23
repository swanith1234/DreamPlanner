import { PrismaClient, TaskStatus } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Checking DB tasks...");
    const tasks = await prisma.task.findMany();
    let updatedCount = 0;
    
    for (const task of tasks) {
        let newStatus = task.status;
        const p = task.progressPercent || 0;
        if (p === 100) newStatus = TaskStatus.COMPLETED;
        else if (p > 0) newStatus = TaskStatus.IN_PROGRESS;
        else newStatus = TaskStatus.PENDING;
        
        if (task.status !== newStatus) {
            console.log(`Updating task ${task.title} from ${task.status} to ${newStatus}`);
            await prisma.task.update({
                where: { id: task.id },
                data: { status: newStatus }
            });
            updatedCount++;
        }
    }
    console.log(`Updated ${updatedCount} task statuses to match their progressPercent.`);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
