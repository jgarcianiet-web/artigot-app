-- DropIndex
DROP INDEX "Contract_workerId_idx";

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CONDICIONES',
ADD COLUMN     "version" INTEGER,
ALTER COLUMN "assignmentId" DROP NOT NULL,
ALTER COLUMN "eventId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Contract_workerId_kind_idx" ON "Contract"("workerId", "kind");
