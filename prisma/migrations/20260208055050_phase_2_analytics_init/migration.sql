-- CreateEnum
CREATE TYPE "CheckpointStatus" AS ENUM ('NOT_STARTED', 'ACTIVE', 'DUE', 'COMPLETED', 'EARLY_STARTED');

-- CreateEnum
CREATE TYPE "UserEventType" AS ENUM ('TASK_CREATED', 'CHECKPOINT_STARTED', 'CHECKPOINT_PROGRESS_UPDATED', 'CHECKPOINT_COMPLETED', 'TASK_COMPLETED', 'NOTIFICATION_RECEIVED', 'NOTIFICATION_CLICKED', 'DAY_WITH_NO_ACTIVITY');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('TASK_AVOIDANCE_HIGH', 'PROCRASTINATION_PATTERN', 'MOTIVATION_DECAY', 'DREAM_RESTART_LOOP', 'HIGH_RESPONSE_LATENCY', 'TONE_MISMATCH', 'CONSISTENT_PROGRESS', 'TASK_OVERLOAD', 'DREAM_TASK_MISALIGNMENT', 'USER_REFLECTION_TRIGGER', 'WEEKLY_VERDICT');

-- AlterEnum
ALTER TYPE "DreamStatus" ADD VALUE 'ARCHIVED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROGRESS_CHECK';

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "lastProgressAt" TIMESTAMP(3),
ADD COLUMN     "progressPercent" INTEGER;

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replacedByToken" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCheckpoint" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "CheckpointStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "isUserEdited" BOOLEAN NOT NULL DEFAULT false,
    "startedEarly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventType" "UserEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInsightSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dreamId" TEXT,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "activeDays" INTEGER NOT NULL,
    "missedDays" INTEGER NOT NULL,
    "longestStreak" INTEGER NOT NULL,
    "currentStreak" INTEGER NOT NULL,
    "totalCheckpointsPlanned" INTEGER NOT NULL,
    "totalCheckpointsCompleted" INTEGER NOT NULL,
    "lateCheckpoints" INTEGER NOT NULL,
    "earlyStarts" INTEGER NOT NULL,
    "overachievementDays" INTEGER NOT NULL,
    "avgDailyProgress" DOUBLE PRECISION NOT NULL,
    "avgProgressLatencyHours" DOUBLE PRECISION NOT NULL,
    "dailyEffort" JSONB NOT NULL,
    "dailyStatus" JSONB NOT NULL,
    "disciplineScore" INTEGER NOT NULL,
    "consistencyScore" INTEGER NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInsightSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dreamId" TEXT,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "insightType" "InsightType" NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "taskId" TEXT,
    "domainEventId" TEXT,

    CONSTRAINT "GeneratedInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "UserEvent_userId_createdAt_idx" ON "UserEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserInsightSnapshot_userId_dreamId_weekStart_key" ON "UserInsightSnapshot"("userId", "dreamId", "weekStart");

-- CreateIndex
CREATE INDEX "GeneratedInsight_userId_createdAt_idx" ON "GeneratedInsight"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCheckpoint" ADD CONSTRAINT "TaskCheckpoint_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInsightSnapshot" ADD CONSTRAINT "UserInsightSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInsightSnapshot" ADD CONSTRAINT "UserInsightSnapshot_dreamId_fkey" FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedInsight" ADD CONSTRAINT "GeneratedInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedInsight" ADD CONSTRAINT "GeneratedInsight_dreamId_fkey" FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedInsight" ADD CONSTRAINT "GeneratedInsight_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedInsight" ADD CONSTRAINT "GeneratedInsight_domainEventId_fkey" FOREIGN KEY ("domainEventId") REFERENCES "DomainEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
