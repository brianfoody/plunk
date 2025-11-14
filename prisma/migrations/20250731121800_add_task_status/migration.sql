-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- Step 1: Add nullable column
ALTER TABLE "tasks" ADD COLUMN "status" "TaskStatus";

-- Step 2: Backfill existing rows with default value
UPDATE "tasks" SET "status" = 'PENDING' WHERE "status" IS NULL;

-- Step 3: Make column non-nullable
ALTER TABLE "tasks" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'PENDING'; 