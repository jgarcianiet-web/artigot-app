-- CreateTable
CREATE TABLE "EventDoc" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventDoc_fileId_key" ON "EventDoc"("fileId");

-- CreateIndex
CREATE INDEX "EventDoc_eventId_idx" ON "EventDoc"("eventId");

-- AddForeignKey
ALTER TABLE "EventDoc" ADD CONSTRAINT "EventDoc_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDoc" ADD CONSTRAINT "EventDoc_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

