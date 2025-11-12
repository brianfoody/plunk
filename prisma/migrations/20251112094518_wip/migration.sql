/*
  Warnings:

  - You are about to drop the `_CampaignToContact_backup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "_CampaignToContact_backup";

-- CreateIndex
CREATE INDEX "emails_campaignId_createdAt_idx" ON "emails"("campaignId", "createdAt");
