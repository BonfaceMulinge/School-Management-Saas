-- CreateEnum
CREATE TYPE "IntegrationChannel" AS ENUM ('PAYMENT', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "ProviderMode" AS ENUM ('SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('FEE_PAYMENT', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "OutboundChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "OutboundMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_INITIATED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'WEBHOOK_RECEIVED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_CONFIG_CHANGE';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE';

-- AlterTable
ALTER TABLE "FeePayment" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerEventId" TEXT,
ADD COLUMN     "providerReference" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- AlterTable
ALTER TABLE "SchoolSubscription" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerEventId" TEXT,
ADD COLUMN     "providerReference" TEXT;

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "channel" "IntegrationChannel" NOT NULL,
    "provider" TEXT,
    "mode" "ProviderMode" NOT NULL DEFAULT 'SANDBOX',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "meta" JSONB,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "feePaymentId" TEXT,
    "subscriptionId" TEXT,
    "studentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "providerEventId" TEXT,
    "checkoutUrl" TEXT,
    "failureReason" TEXT,
    "initiatedById" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "expiryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "processingNote" TEXT,
    "transactionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "userId" TEXT,
    "channel" "OutboundChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerReference" TEXT,
    "dedupeKey" TEXT,
    "errorReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_channel_key" ON "IntegrationConfig"("channel");

-- CreateIndex
CREATE INDEX "IntegrationConfig_channel_idx" ON "IntegrationConfig"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_idempotencyKey_key" ON "PaymentTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_providerReference_key" ON "PaymentTransaction"("providerReference");

-- CreateIndex
CREATE INDEX "PaymentTransaction_schoolId_createdAt_idx" ON "PaymentTransaction"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_purpose_idx" ON "PaymentTransaction"("purpose");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_transactionId_idx" ON "WebhookEvent"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_dedupeKey_key" ON "OutboundMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboundMessage_schoolId_createdAt_idx" ON "OutboundMessage"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_createdAt_idx" ON "OutboundMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_channel_status_idx" ON "OutboundMessage"("channel", "status");

-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_feePaymentId_fkey" FOREIGN KEY ("feePaymentId") REFERENCES "FeePayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "SchoolSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
