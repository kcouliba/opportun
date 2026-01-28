-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "yearsExperience" INTEGER,
    "legalStructure" TEXT,
    "minimumTJM" INTEGER,
    "targetTJM" INTEGER,
    "preferredLocations" TEXT,
    "maxCommuteDays" INTEGER,
    "technologies" TEXT,
    "domains" TEXT,
    "blacklistedClients" TEXT,
    "blacklistedDomains" TEXT
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "client" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "rate" INTEGER NOT NULL,
    "daysPerWeek" REAL NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'active',
    "profileId" TEXT NOT NULL,
    CONSTRAINT "Mission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "client" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requiredTechnologies" TEXT,
    "requiredDomains" TEXT,
    "location" TEXT,
    "remotePolicy" TEXT,
    "offeredRate" INTEGER,
    "estimatedRevenue" INTEGER,
    "estimatedStartDate" DATETIME,
    "estimatedDuration" INTEGER,
    "stage" TEXT NOT NULL DEFAULT 'lead',
    "matchScore" INTEGER,
    "autoFiltered" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "contactName" TEXT,
    "contactInfo" TEXT,
    "nextAction" TEXT,
    "nextActionDate" DATETIME,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "Lead_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "leadId" TEXT NOT NULL,
    CONSTRAINT "Document_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "expiresAt" DATETIME,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "profileId" TEXT NOT NULL,
    CONSTRAINT "ApiKey_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER,
    "leadId" TEXT NOT NULL,
    CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
