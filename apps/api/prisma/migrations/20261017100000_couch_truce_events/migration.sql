-- Couch Truce (additive only): the group's latest picks, shown to everyone in the group,
-- and first-party loop events.
ALTER TABLE "Pair" ADD COLUMN     "lastAnswer" JSONB,
ADD COLUMN     "lastPickAt" TIMESTAMP(3);

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "profileId" TEXT,
    "groupId" TEXT,
    "props" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Event_type_createdAt_idx" ON "Event"("type", "createdAt");
CREATE INDEX "Event_deviceHash_idx" ON "Event"("deviceHash");
CREATE INDEX "Event_profileId_idx" ON "Event"("profileId");
CREATE INDEX "Event_groupId_idx" ON "Event"("groupId");
