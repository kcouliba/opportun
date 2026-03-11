CREATE TABLE IF NOT EXISTS syncState (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    deviceId TEXT NOT NULL,
    deviceName TEXT NOT NULL DEFAULT '',
    syncKey TEXT,
    lastSyncedAt TEXT,
    lastSnapshotHash TEXT,
    relayUrl TEXT NOT NULL DEFAULT 'https://relay.opportun.app'
);
