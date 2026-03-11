use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::crypto::SyncError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayMeta {
    pub timestamp: u64,
    pub size: u64,
    pub pushed_by: String,
    pub expires_at: String,
}

pub struct RelayClient {
    client: reqwest::Client,
    relay_url: String,
    device_id: String,
    sync_group: String, // hex(sha256(syncKey))
}

impl RelayClient {
    pub fn new(relay_url: &str, device_id: &str, sync_key: &[u8]) -> Self {
        let group_hash = Sha256::digest(sync_key);
        RelayClient {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
            relay_url: relay_url.trim_end_matches('/').to_string(),
            device_id: device_id.to_string(),
            sync_group: hex::encode(group_hash),
        }
    }

    /// Upload an encrypted snapshot blob to the relay.
    pub async fn push(&self, blob: &[u8]) -> Result<(), SyncError> {
        let url = format!("{}/v1/sync/push", self.relay_url);
        let resp = self
            .client
            .post(&url)
            .header("X-Device-ID", &self.device_id)
            .header("X-Sync-Group", &self.sync_group)
            .header("Content-Type", "application/octet-stream")
            .body(blob.to_vec())
            .send()
            .await
            .map_err(|e| SyncError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::RelayError(format!(
                "Push failed ({}): {}",
                status, body
            )));
        }

        Ok(())
    }

    /// Check if a newer snapshot exists on the relay.
    pub async fn get_meta(&self) -> Result<Option<RelayMeta>, SyncError> {
        let url = format!("{}/v1/sync/meta", self.relay_url);
        let resp = self
            .client
            .get(&url)
            .header("X-Device-ID", &self.device_id)
            .header("X-Sync-Group", &self.sync_group)
            .send()
            .await
            .map_err(|e| SyncError::NetworkError(e.to_string()))?;

        if resp.status().as_u16() == 404 {
            return Ok(None);
        }

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::RelayError(format!(
                "Meta failed ({}): {}",
                status, body
            )));
        }

        let meta = resp
            .json::<RelayMeta>()
            .await
            .map_err(|e| SyncError::RelayError(format!("Invalid meta response: {}", e)))?;

        Ok(Some(meta))
    }

    /// Download the latest encrypted snapshot blob from the relay.
    pub async fn pull(&self) -> Result<Vec<u8>, SyncError> {
        let url = format!("{}/v1/sync/pull", self.relay_url);
        let resp = self
            .client
            .get(&url)
            .header("X-Device-ID", &self.device_id)
            .header("X-Sync-Group", &self.sync_group)
            .send()
            .await
            .map_err(|e| SyncError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(SyncError::RelayError(format!(
                "Pull failed ({}): {}",
                status, body
            )));
        }

        resp.bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| SyncError::NetworkError(e.to_string()))
    }
}
