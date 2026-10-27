-- CreateTable
CREATE TABLE "WorkerThread" (
    "workerId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workerReadAt" TIMESTAMP(3),
    "staffReadAt" TIMESTAMP(3),

    CONSTRAINT "WorkerThread_pkey" PRIMARY KEY ("workerId")
);

-- CreateTable
CREATE TABLE "WorkerMessage" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "fromWorker" BOOLEAN NOT NULL,
    "adminId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerThread_lastMessageAt_idx" ON "WorkerThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "WorkerMessage_workerId_createdAt_idx" ON "WorkerMessage"("workerId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkerThread" ADD CONSTRAINT "WorkerThread_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerMessage" ADD CONSTRAINT "WorkerMessage_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerThread"("workerId") ON DELETE CASCADE ON UPDATE CASCADE;

