-- Migration: add_isprocessing_and_hnsw_indexes
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add isProcessing lock column to ActionSession
--    Prevents double-tap race condition when user sends two messages rapidly
--    while a tool is being executed.
--
-- 2. Add HNSW vector indexes on embedding columns.
--    Without these, pgvector does a sequential scan on every smartEntitySearch
--    query. With HNSW, lookups are approximate-nearest-neighbor O(log n).
--    Required once you have more than ~500 rows per table.
--
-- operator class: vector_cosine_ops matches the <=> cosine distance operator
-- used in hybridRouter and smartEntitySearch queries.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. ActionSession processing lock
ALTER TABLE "ActionSession" ADD COLUMN IF NOT EXISTS "isProcessing" BOOLEAN NOT NULL DEFAULT false;

-- 2. HNSW indexes for vector similarity search
--    m=16, ef_construction=64 are sensible defaults for up to 1M rows.
--    Increase ef_construction (up to 256) if you want higher recall at the cost
--    of longer index build time.

CREATE INDEX IF NOT EXISTS "dream_embedding_hnsw_idx"
    ON "Dream" USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "task_embedding_hnsw_idx"
    ON "Task" USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "toolregistry_embedding_hnsw_idx"
    ON "ToolRegistry" USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
