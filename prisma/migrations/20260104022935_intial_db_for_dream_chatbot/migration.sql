-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dream" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawInputText" TEXT NOT NULL,
    "intentType" TEXT,
    "targetOutcome" TEXT,
    "timelineMonths" INTEGER,
    "domain" TEXT,
    "role" TEXT,
    "currentLevel" TEXT,
    "strategy" TEXT,
    "extraContext" JSONB,
    "clarityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'GATHERING_INFO',
    "requiredFields" JSONB,
    "collectedFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DreamClarification" (
    "id" TEXT NOT NULL,
    "dreamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reasonForAsking" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "userAnswer" TEXT,
    "answerProvidedAt" TIMESTAMP(3),
    "resolvedUncertainty" BOOLEAN NOT NULL DEFAULT false,
    "clarityContribution" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "turn" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DreamClarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL,
    "dreamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "dreamId" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawInputText" TEXT NOT NULL,
    "resolvedStructure" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "effort" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Dream_userId_idx" ON "Dream"("userId");

-- CreateIndex
CREATE INDEX "Dream_status_idx" ON "Dream"("status");

-- CreateIndex
CREATE INDEX "DreamClarification_dreamId_idx" ON "DreamClarification"("dreamId");

-- CreateIndex
CREATE INDEX "DreamClarification_userId_idx" ON "DreamClarification"("userId");

-- CreateIndex
CREATE INDEX "DreamClarification_fieldName_idx" ON "DreamClarification"("fieldName");

-- CreateIndex
CREATE UNIQUE INDEX "Roadmap_dreamId_key" ON "Roadmap"("dreamId");

-- CreateIndex
CREATE INDEX "Roadmap_userId_idx" ON "Roadmap"("userId");

-- CreateIndex
CREATE INDEX "Roadmap_dreamId_idx" ON "Roadmap"("dreamId");

-- CreateIndex
CREATE INDEX "Task_dreamId_idx" ON "Task"("dreamId");

-- CreateIndex
CREATE INDEX "Task_roadmapId_idx" ON "Task"("roadmapId");

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

-- CreateIndex
CREATE INDEX "RateLimit_userId_idx" ON "RateLimit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_userId_endpoint_windowStart_key" ON "RateLimit"("userId", "endpoint", "windowStart");

-- AddForeignKey
ALTER TABLE "Dream" ADD CONSTRAINT "Dream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DreamClarification" ADD CONSTRAINT "DreamClarification_dreamId_fkey" FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DreamClarification" ADD CONSTRAINT "DreamClarification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_dreamId_fkey" FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dreamId_fkey" FOREIGN KEY ("dreamId") REFERENCES "Dream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
