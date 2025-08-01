-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "status" "TaskStatus" NOT NULL DEFAULT 'PENDING'; 