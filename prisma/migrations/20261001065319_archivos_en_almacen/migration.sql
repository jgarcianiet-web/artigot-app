-- AlterTable
ALTER TABLE "StoredFile" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;
