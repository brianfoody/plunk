/*
  Warnings:

  - You are about to drop the `_CampaignToContact_backup` table. If the table is not empty, all the data it contains will be lost.

*/
-- Verify data migration before dropping backup table
DO $$
DECLARE
    backup_count INTEGER;
    new_count INTEGER;
BEGIN
    -- Count records in backup table
    SELECT COUNT(*) INTO backup_count FROM "_CampaignToContact_backup";
    
    -- Count records in new table
    SELECT COUNT(*) INTO new_count FROM "campaign_recipients";
    
    -- Verify counts match
    IF backup_count != new_count THEN
        RAISE EXCEPTION 'Data migration verification failed: backup table has % records but new table has % records. Migration aborted to prevent data loss.', backup_count, new_count;
    END IF;
    
    -- Log success
    RAISE NOTICE 'Data migration verified: % records in both tables. Proceeding with backup table removal.', backup_count;
END $$;

-- DropTable (only reached if verification passes)
DROP TABLE "_CampaignToContact_backup";

-- CreateIndex
CREATE INDEX "emails_campaignId_createdAt_idx" ON "emails"("campaignId", "createdAt");
