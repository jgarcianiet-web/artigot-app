-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "photoFileId" TEXT,
ADD COLUMN     "photoNote" TEXT,
ADD COLUMN     "photoStatus" TEXT,
ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "phoneKey" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Worker_photoFileId_key" ON "Worker"("photoFileId");

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

