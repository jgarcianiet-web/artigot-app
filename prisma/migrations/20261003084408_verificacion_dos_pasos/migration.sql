-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "loginCodeExpires" TIMESTAMP(3),
ADD COLUMN     "loginCodeHash" TEXT,
ADD COLUMN     "loginCodeTries" INTEGER NOT NULL DEFAULT 0;

