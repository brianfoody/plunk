-- Drop foreign keys and indexes before renaming so new names can be reused
ALTER TABLE "_CampaignToContact" DROP CONSTRAINT IF EXISTS "_CampaignToContact_A_fkey";
ALTER TABLE "_CampaignToContact" DROP CONSTRAINT IF EXISTS "_CampaignToContact_B_fkey";
DROP INDEX IF EXISTS "_CampaignToContact_AB_unique";
DROP INDEX IF EXISTS "_CampaignToContact_B_index";

-- Rename table and columns to match Prisma model
ALTER TABLE "_CampaignToContact" RENAME TO "campaign_recipients";
ALTER TABLE "campaign_recipients" RENAME COLUMN "A" TO "campaignId";
ALTER TABLE "campaign_recipients" RENAME COLUMN "B" TO "contactId";

-- Add timestamp columns required by Prisma
ALTER TABLE "campaign_recipients"
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Define the primary key and indexes expected by the Prisma schema
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("campaignId","contactId");
CREATE INDEX "campaign_recipients_campaignId_idx" ON "campaign_recipients"("campaignId");
CREATE INDEX "campaign_recipients_contactId_idx" ON "campaign_recipients"("contactId");

-- Re-create foreign keys with cascading behavior
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
