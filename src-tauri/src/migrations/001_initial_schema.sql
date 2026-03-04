-- Profile
CREATE TABLE IF NOT EXISTS "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
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

-- Mission
CREATE TABLE IF NOT EXISTS "Mission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "client" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "rate" INTEGER NOT NULL,
    "daysPerWeek" REAL NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'active',
    "profileId" TEXT NOT NULL,
    FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE
);

-- Lead
CREATE TABLE IF NOT EXISTS "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
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
    "estimatedStartDate" TEXT,
    "estimatedDuration" INTEGER,
    "stage" TEXT NOT NULL DEFAULT 'lead',
    "matchScore" INTEGER,
    "autoFiltered" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "contactName" TEXT,
    "contactInfo" TEXT,
    "nextAction" TEXT,
    "nextActionDate" TEXT,
    "profileId" TEXT NOT NULL,
    FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE
);

-- Document
CREATE TABLE IF NOT EXISTS "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "leadId" TEXT NOT NULL,
    FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE
);

-- ApiKey
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL UNIQUE,
    "keyPrefix" TEXT NOT NULL,
    "lastUsedAt" TEXT,
    "expiresAt" TEXT,
    "revoked" INTEGER NOT NULL DEFAULT 0,
    "profileId" TEXT NOT NULL,
    FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE
);

-- Activity
CREATE TABLE IF NOT EXISTS "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TEXT NOT NULL DEFAULT (datetime('now')),
    "duration" INTEGER,
    "leadId" TEXT NOT NULL,
    FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE CASCADE
);
