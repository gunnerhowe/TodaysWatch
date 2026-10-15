-- CreateEnum
CREATE TYPE "TitleType" AS ENUM ('MOVIE', 'TV');

-- CreateEnum
CREATE TYPE "Source" AS ENUM ('YOUTUBE', 'REDDIT', 'TRAKT', 'BLUESKY', 'TMDB_REVIEW');

-- CreateEnum
CREATE TYPE "Stance" AS ENUM ('LIKED', 'MIXED', 'DISLIKED', 'NONE');

-- CreateEnum
CREATE TYPE "ScoreState" AS ENUM ('NONE', 'PENDING', 'EARLY', 'FULL', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "RatingValue" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "type" "TitleType" NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "releaseDate" TIMESTAMP(3),
    "genres" TEXT[],
    "runtimeMin" INTEGER,
    "posterPath" TEXT,
    "overview" TEXT,
    "popularity" DOUBLE PRECISION,
    "tmdbVoteAvg" DOUBLE PRECISION,
    "tmdbVoteCount" INTEGER,
    "qlooEntityId" TEXT,
    "qlooMatchConf" DOUBLE PRECISION,
    "youtubeVideoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scoreState" "ScoreState" NOT NULL DEFAULT 'NONE',
    "likedPct" INTEGER,
    "mixedPct" INTEGER,
    "dislikedPct" INTEGER,
    "countedN" INTEGER NOT NULL DEFAULT 0,
    "collectedN" INTEGER NOT NULL DEFAULT 0,
    "marginPts" INTEGER,
    "wilsonLow" DOUBLE PRECISION,
    "genrePctl" JSONB,
    "genreAdjusted" DOUBLE PRECISION,
    "sourceCounts" JSONB,
    "summary" TEXT,
    "scoreVersion" TEXT,
    "basicClassifier" BOOLEAN NOT NULL DEFAULT false,
    "scoredAt" TIMESTAMP(3),
    "nextRefreshAt" TIMESTAMP(3),
    "detailsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "authorHash" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "likes" INTEGER,
    "aboutTitle" BOOLEAN,
    "firsthand" BOOLEAN,
    "stance" "Stance",
    "confidence" DOUBLE PRECISION,
    "classifier" TEXT,
    "isQuote" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "liked" INTEGER NOT NULL,
    "mixed" INTEGER NOT NULL,
    "disliked" INTEGER NOT NULL,
    "counted" INTEGER NOT NULL,
    "collected" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenreBaseline" (
    "genre" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "medianLiked" DOUBLE PRECISION NOT NULL,
    "sortedLiked" INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenreBaseline_pkey" PRIMARY KEY ("genre")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "anonToken" TEXT NOT NULL,
    "userId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{"includeSeen":false}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "profileId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "value" "RatingValue",
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "wantToWatch" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("profileId","titleId")
);

-- CreateTable
CREATE TABLE "Pair" (
    "id" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "toolCalls" JSONB NOT NULL,
    "picks" JSONB NOT NULL,
    "rejectedFinal" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QlooCall" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT,
    "tool" TEXT NOT NULL,
    "argsRedacted" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QlooCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLedger" (
    "day" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "used" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("day","provider")
);

-- CreateTable
CREATE TABLE "McpLink" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "mcpSessionId" TEXT,
    "boundUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheEntry" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CacheEntry_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "Title_scoreState_nextRefreshAt_idx" ON "Title"("scoreState", "nextRefreshAt");

-- CreateIndex
CREATE INDEX "Title_qlooEntityId_idx" ON "Title"("qlooEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "Title_tmdbId_type_key" ON "Title"("tmdbId", "type");

-- CreateIndex
CREATE INDEX "Mention_titleId_stance_idx" ON "Mention"("titleId", "stance");

-- CreateIndex
CREATE INDEX "Mention_expiresAt_idx" ON "Mention"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_source_externalId_key" ON "Mention"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_titleId_authorHash_key" ON "Mention"("titleId", "authorHash");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_titleId_computedAt_idx" ON "ScoreSnapshot"("titleId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_anonToken_key" ON "Profile"("anonToken");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Pair_inviteCode_key" ON "Pair"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "McpLink_codeHash_key" ON "McpLink"("codeHash");

-- CreateIndex
CREATE INDEX "CacheEntry_expiresAt_idx" ON "CacheEntry"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSnapshot" ADD CONSTRAINT "ScoreSnapshot_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_aId_fkey" FOREIGN KEY ("aId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pair" ADD CONSTRAINT "Pair_bId_fkey" FOREIGN KEY ("bId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QlooCall" ADD CONSTRAINT "QlooCall_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpLink" ADD CONSTRAINT "McpLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
