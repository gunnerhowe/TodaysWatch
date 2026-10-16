-- Group Pick: an invite for 2-5 people. Members (owner included) live in PairMember.
ALTER TABLE "Pair" ADD COLUMN     "size" INTEGER NOT NULL DEFAULT 2;

CREATE TABLE "PairMember" (
    "pairId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PairMember_pkey" PRIMARY KEY ("pairId","profileId")
);

CREATE INDEX "PairMember_profileId_idx" ON "PairMember"("profileId");

ALTER TABLE "PairMember" ADD CONSTRAINT "PairMember_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "Pair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PairMember" ADD CONSTRAINT "PairMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing two-person invites: the owner and the partner who joined become members.
INSERT INTO "PairMember" ("pairId", "profileId", "joinedAt")
SELECT "id", "aId", "createdAt" FROM "Pair"
ON CONFLICT DO NOTHING;

INSERT INTO "PairMember" ("pairId", "profileId", "joinedAt")
SELECT "id", "bId", "createdAt" FROM "Pair" WHERE "bId" IS NOT NULL
ON CONFLICT DO NOTHING;
