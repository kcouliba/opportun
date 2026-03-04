CREATE TABLE IF NOT EXISTS aiSettings (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    enabled INTEGER NOT NULL DEFAULT 0,
    modelName TEXT NOT NULL DEFAULT 'llama3.2:3b',
    ollamaUrl TEXT NOT NULL DEFAULT 'http://localhost:11434',
    temperature REAL NOT NULL DEFAULT 0.3,
    maxTokens INTEGER NOT NULL DEFAULT 2048
);

INSERT OR IGNORE INTO aiSettings (id) VALUES ('singleton');
