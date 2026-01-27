/*
  Warnings:

  - You are about to drop the column `clarityScore` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `collectedFields` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `currentLevel` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `domain` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `extraContext` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `intentType` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `rawInputText` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `requiredFields` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `strategy` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `targetOutcome` on the `Dream` table. All the data in the column will be lost.
  - You are about to drop the column `timelineMonths` on the `Dream` table. All the data in the column will be lost.
  - The `status` column on the `Dream` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `effort` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `rawInputText` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `resolvedStructure` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `roadmapId` on the `Task` table. All the data in the column will be lost.
  - The `status` column on the `Task` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `DreamClarification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RateLimit` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RefreshToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Roadmap` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `deadline` to the `Dream` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `Dream` table without a default value. This is not possible if the table is not empty.
  - Added the required column `impactScore` to the `Dream` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Dream` table without a default value. This is not possible if the table is not empty.
  - Added the required column `deadline` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priority` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REMINDER', 'MOTIVATIONAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DreamStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "MotivationTone" AS ENUM ('HARSH', 'POSITIVE', 'OPTIMISTIC', 'FEAR', 'LOGICAL', 'NEUTRAL');

-- DropForeignKey
ALTER TABLE "Dream" DROP CONSTRAINT "Dream_userId_fkey";

-- DropForeignKey
ALTER TABLE "DreamClarification" DROP CONSTRAINT "DreamClarification_dreamId_fkey";

-- DropForeignKey
ALTER TABLE "DreamClarification" DROP CONSTRAINT "DreamClarification_userId_fkey";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "Roadmap" DROP CONSTRAINT "Roadmap_dreamId_fkey";

-- DropForeignKey
ALTER TABLE "Roadmap" DROP CONSTRAINT "Roadmap_userId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_dreamId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_roadmapId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_userId_fkey";

-- DropIndex
DROP INDEX "Dream_status_idx";

-- DropIndex
DROP INDEX "Dream_userId_idx";

-- DropIndex
DROP INDEX "Task_dreamId_idx";

-- DropIndex
DROP INDEX "Task_roadmapId_idx";

-- DropIndex
DROP INDEX "Task_userId_idx";

-- DropIndex
DROP INDEX "User_email_idx";

-- AlterTable
ALTER TABLE "Dream" DROP COLUMN "clarityScore",
DROP COLUMN "collectedFields",
DROP COLUMN "currentLevel",
DROP COLUMN "domain",
DROP COLUMN "extraContext",
DROP COLUMN "intentType",
DROP COLUMN "rawInputText",
DROP COLUMN "requiredFields",
DROP COLUMN "role",
DROP COLUMN "strategy",
DROP COLUMN "targetOutcome",
DROP COLUMN "timelineMonths",
ADD COLUMN     "deadline" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "impactScore" INTEGER NOT NULL,
ADD COLUMN     "motivationStatement" TEXT,
ADD COLUMN     "title" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "DreamStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "effort",
DROP COLUMN "rawInputText",
DROP COLUMN "resolvedStructure",
DROP COLUMN "roadmapId",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deadline" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "estimatedDuration" INTEGER,
ADD COLUMN     "priority" INTEGER NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "title" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "password",
ADD COLUMN     "name" TEXT,
ADD COLUMN     "passwordHash" TEXT NOT NULL,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- DropTable
DROP TABLE "DreamClarification";

-- DropTable
DROP TABLE "RateLimit";

-- DropTable
DROP TABLE "RefreshToken";

-- DropTable
DROP TABLE "Roadmap";

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "motivationTone" "MotivationTone" NOT NULL DEFAULT 'NEUTRAL',
    "notificationFrequency" INTEGER NOT NULL,
    "sleepStart" TEXT NOT NULL,
    "sleepEnd" TEXT NOT NULL,
    "quietHours" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DreamCheckpoint" (
    "id" TEXT NOT NULL,
    "dreamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "expectedEffort" INTEGER,
    "miniDeadline" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL,
    "isUserModified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DreamCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dreamId" TEXT,
    "taskId" TEXT,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppLog" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dream" ADD CONSTRAINT "Dream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DreamCheckpoint" ADD CONSTRAINT "DreamCheckpoint_dreamId_fkey" FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dreamId_fkey" FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_dreamId_fkey" FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppLog" ADD CONSTRAINT "AppLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
