-- CreateTable
CREATE TABLE "StaffRoom" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRoomMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "adminId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRoom_lastMessageAt_idx" ON "StaffRoom"("lastMessageAt");

-- CreateIndex
CREATE INDEX "StaffRoomMember_adminId_idx" ON "StaffRoomMember"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRoomMember_roomId_adminId_key" ON "StaffRoomMember"("roomId", "adminId");

-- CreateIndex
CREATE INDEX "StaffMessage_roomId_createdAt_idx" ON "StaffMessage"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffRoomMember" ADD CONSTRAINT "StaffRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "StaffRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoomMember" ADD CONSTRAINT "StaffRoomMember_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMessage" ADD CONSTRAINT "StaffMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "StaffRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

