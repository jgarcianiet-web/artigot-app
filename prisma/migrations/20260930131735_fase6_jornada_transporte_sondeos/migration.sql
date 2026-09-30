-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "checkInOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkOutOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rideWithId" TEXT,
ADD COLUMN     "seats" INTEGER,
ADD COLUMN     "transport" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "data" JSONB,
ADD COLUMN     "signerNote" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "meetingPoint" TEXT,
ADD COLUMN     "meetingTime" TEXT;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "carSeats" INTEGER;

-- CreateTable
CREATE TABLE "AvailabilityPoll" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "dates" TEXT[],
    "roles" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AvailabilityPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollAnswer" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "available" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PollAnswer_workerId_date_idx" ON "PollAnswer"("workerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PollAnswer_pollId_workerId_date_key" ON "PollAnswer"("pollId", "workerId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_rideWithId_fkey" FOREIGN KEY ("rideWithId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAnswer" ADD CONSTRAINT "PollAnswer_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "AvailabilityPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollAnswer" ADD CONSTRAINT "PollAnswer_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
