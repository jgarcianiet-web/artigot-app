-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "contractCode" TEXT,
ADD COLUMN     "monthlySalary" DOUBLE PRECISION,
ADD COLUMN     "noClock" BOOLEAN NOT NULL DEFAULT false;

