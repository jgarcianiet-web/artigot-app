-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "venueId" TEXT;

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accessNotes" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BODA',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "unloadTime" TEXT,
    "needCamareros" INTEGER NOT NULL DEFAULT 0,
    "needResponsables" INTEGER NOT NULL DEFAULT 0,
    "needMaitres" INTEGER NOT NULL DEFAULT 0,
    "needMozos" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "venueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_name_key" ON "Venue"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EventTemplate_name_key" ON "EventTemplate"("name");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
