-- CreateTable
CREATE TABLE "ExternalSigner" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dni" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "codeHash" TEXT,
    "codeSentAt" TIMESTAMP(3),
    "codeTries" INTEGER NOT NULL DEFAULT 0,
    "sessionHash" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signerIp" TEXT,
    "signerNote" TEXT,
    "signatureFileId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalSigner_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "ExternalSigner_token_key" ON "ExternalSigner"("token");
-- CreateIndex
CREATE UNIQUE INDEX "ExternalSigner_signatureFileId_key" ON "ExternalSigner"("signatureFileId");
-- CreateIndex
CREATE INDEX "ExternalSigner_requestId_idx" ON "ExternalSigner"("requestId");
-- AddForeignKey
ALTER TABLE "ExternalSigner" ADD CONSTRAINT "ExternalSigner_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ExternalSigner" ADD CONSTRAINT "ExternalSigner_signatureFileId_fkey" FOREIGN KEY ("signatureFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
