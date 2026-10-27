-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "WorkerGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "onlyStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staffReadAt" TIMESTAMP(3),

    CONSTRAINT "WorkerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerGroupMember" (
    "groupId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "WorkerGroupMember_pkey" PRIMARY KEY ("groupId","workerId")
);

-- CreateTable
CREATE TABLE "GroupMessage" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "workerId" TEXT,
    "adminId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerGroup_lastMessageAt_idx" ON "WorkerGroup"("lastMessageAt");

-- CreateIndex
CREATE INDEX "WorkerGroupMember_workerId_idx" ON "WorkerGroupMember"("workerId");

-- CreateIndex
CREATE INDEX "GroupMessage_groupId_createdAt_idx" ON "GroupMessage"("groupId", "createdAt");

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerGroupMember" ADD CONSTRAINT "WorkerGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerGroupMember" ADD CONSTRAINT "WorkerGroupMember_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

