-- Rollback migration for TaskStatus
-- Step 1: Remove NOT NULL constraint and default
ALTER TABLE "tasks" ALTER COLUMN "status" DROP NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;

-- Step 2: Drop the column
ALTER TABLE "tasks" DROP COLUMN "status";

-- Step 3: Drop the enum type
DROP TYPE "TaskStatus";

