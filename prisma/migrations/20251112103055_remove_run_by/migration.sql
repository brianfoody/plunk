/*
  Warnings:

  - You are about to drop the column `runBy` on the `tasks` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "tasks_runBy_createdAt_idx";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "runBy";

-- CreateIndex
CREATE INDEX "tasks_createdAt_idx" ON "tasks"("createdAt");
