-- CreateTable
CREATE TABLE "EventDraft" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "form" JSONB NOT NULL,
    "staff" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventDraft_date_idx" ON "EventDraft"("date");

