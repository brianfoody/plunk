-- CreateIndex for campaigns email lookups
CREATE INDEX "emails_campaignId_createdAt_idx" ON "emails"("campaignId", "createdAt");
