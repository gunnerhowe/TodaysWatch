-- "Not this one" on a pick: keep that title out of future picks (not a thumbs down).
ALTER TABLE "Rating" ADD COLUMN     "notInterested" BOOLEAN NOT NULL DEFAULT false;
