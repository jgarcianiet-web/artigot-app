-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "checkInAccuracy" INTEGER,
ADD COLUMN     "checkInDistance" INTEGER,
ADD COLUMN     "checkInLat" DOUBLE PRECISION,
ADD COLUMN     "checkInLng" DOUBLE PRECISION,
ADD COLUMN     "checkInManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkOutAccuracy" INTEGER,
ADD COLUMN     "checkOutDistance" INTEGER,
ADD COLUMN     "checkOutLat" DOUBLE PRECISION,
ADD COLUMN     "checkOutLng" DOUBLE PRECISION,
ADD COLUMN     "checkOutManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;
