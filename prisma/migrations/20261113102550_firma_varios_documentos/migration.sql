-- CreateTable
CREATE TABLE "SignRequestFile" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SignRequestFile_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "SignRequestFile_fileId_key" ON "SignRequestFile"("fileId");
-- CreateIndex
CREATE INDEX "SignRequestFile_requestId_position_idx" ON "SignRequestFile"("requestId", "position");
-- AddForeignKey
ALTER TABLE "SignRequestFile" ADD CONSTRAINT "SignRequestFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SignRequestFile" ADD CONSTRAINT "SignRequestFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Los envíos que ya había: su único PDF pasa a ser su primer documento
INSERT INTO "SignRequestFile" ("id", "requestId", "fileId", "title", "position")
SELECT "id" || '-1', "id", "fileId", "title", 0 FROM "SignRequest";
