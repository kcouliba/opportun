CREATE TABLE IF NOT EXISTS appSettings (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    leadSources TEXT NOT NULL DEFAULT '["recruiter","linkedin","freework","comet","referral","direct","other"]'
);

INSERT OR IGNORE INTO appSettings (id) VALUES ('singleton');
