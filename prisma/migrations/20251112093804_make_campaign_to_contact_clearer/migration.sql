-- Drop foreign keys before renaming
ALTER TABLE "_CampaignToContact" DROP CONSTRAINT IF EXISTS "_CampaignToContact_A_fkey";
ALTER TABLE "_CampaignToContact" DROP CONSTRAINT IF EXISTS "_CampaignToContact_B_fkey";

-- Rename old table to backup
ALTER TABLE "_CampaignToContact" RENAME TO "_CampaignToContact_backup";

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("campaignId","contactId")
);

-- Migrate data from backup table to new table
-- Note: Prisma's implicit many-to-many uses "A" for campaignId and "B" for contactId
INSERT INTO "campaign_recipients" ("campaignId", "contactId", "createdAt", "updatedAt")
SELECT "A" as "campaignId", "B" as "contactId", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_CampaignToContact_backup";

-- CreateIndex
CREATE INDEX "campaign_recipients_campaignId_idx" ON "campaign_recipients"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_recipients_contactId_idx" ON "campaign_recipients"("contactId");

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
