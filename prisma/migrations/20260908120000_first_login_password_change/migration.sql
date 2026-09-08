ALTER TABLE "User"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
