CREATE TABLE IF NOT EXISTS "WatchSource" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "createdAt"      TEXT NOT NULL DEFAULT (datetime('now')),
    "updatedAt"      TEXT NOT NULL DEFAULT (datetime('now')),
    "name"           TEXT NOT NULL,
    "url"            TEXT NOT NULL,
    "lastCheckedAt"  TEXT,
    "lastFoundCount" INTEGER,
    "profileId"      TEXT NOT NULL,
    FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "DiscoveredLead" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "createdAt"      TEXT NOT NULL DEFAULT (datetime('now')),
    "sourceId"       TEXT NOT NULL,
    "title"          TEXT NOT NULL DEFAULT 'Unknown',
    "client"         TEXT,
    "location"       TEXT,
    "rate"           INTEGER,
    "snippet"        TEXT,
    "listingUrl"     TEXT,
    "status"         TEXT NOT NULL DEFAULT 'new',
    "importedLeadId" TEXT,
    FOREIGN KEY ("sourceId") REFERENCES "WatchSource" ("id") ON DELETE CASCADE,
    FOREIGN KEY ("importedLeadId") REFERENCES "Lead" ("id") ON DELETE SET NULL
);
