-- ─────────────────────────────────────────────────────────────────────────────
-- 001_notification_actions.sql
--
-- Adds ONLY what the notification-action feature needs:
--   1. Notification.checkpointId  — bind a reminder to one exact checkpoint
--   2. NotificationAction         — idempotency ledger for action-button taps
--
-- HAND-WRITTEN ON PURPOSE. `prisma migrate diff` against the live database also
-- emitted the statements below, which must NOT be run:
--
--   DROP INDEX "dream_embedding_hnsw_idx";
--   DROP INDEX "task_embedding_hnsw_idx";
--   DROP INDEX "toolregistry_embedding_hnsw_idx";
--   ALTER TABLE "ActionSession" DROP COLUMN "isProcessing";
--
-- Those objects exist in the database but not in schema.prisma (drift). The HNSW
-- indexes back pgvector similarity search for the semantic tool router and the
-- entity resolver — dropping them would quietly degrade every chat action to a
-- sequential scan. Reconcile that drift separately by ADDING the indexes to
-- schema.prisma, not by letting a migration delete them.
--
-- Safe to re-run: every statement is guarded.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Notification → checkpoint binding ────────────────────────────────────────
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "checkpointId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Notification_checkpointId_fkey'
    ) THEN
        ALTER TABLE "Notification"
            ADD CONSTRAINT "Notification_checkpointId_fkey"
            FOREIGN KEY ("checkpointId") REFERENCES "TaskCheckpoint"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 2. Idempotency ledger for notification-triggered mutations ──────────────────
CREATE TABLE IF NOT EXISTS "NotificationAction" (
    "id"             TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "actionType"     TEXT NOT NULL,
    "value"          INTEGER,
    "resultProgress" INTEGER,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationAction_idempotencyKey_key"
    ON "NotificationAction"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "NotificationAction_notificationId_idx"
    ON "NotificationAction"("notificationId");

CREATE INDEX IF NOT EXISTS "NotificationAction_userId_createdAt_idx"
    ON "NotificationAction"("userId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NotificationAction_notificationId_fkey'
    ) THEN
        ALTER TABLE "NotificationAction"
            ADD CONSTRAINT "NotificationAction_notificationId_fkey"
            FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
