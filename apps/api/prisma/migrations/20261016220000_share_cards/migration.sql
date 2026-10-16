-- Share links for group picks and taste matches (/s/<id>), snapshotted on the server.
CREATE TABLE "ShareCard" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "profileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareCard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShareCard_profileId_idx" ON "ShareCard"("profileId");
