use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chacha20poly1305::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng},
    XChaCha20Poly1305, XNonce,
};
use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug)]
pub enum SyncError {
    InvalidKey,
    DecryptionFailed,
    CompressionError(String),
    InvalidFormat(String),
    InvalidVersion(u8),
    NetworkError(String),
    RelayError(String),
    NotPaired,
    RestoreFailed(String),
}

impl fmt::Display for SyncError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyncError::InvalidKey => write!(f, "Invalid sync key"),
            SyncError::DecryptionFailed => write!(f, "Decryption failed (wrong key or corrupted data)"),
            SyncError::CompressionError(e) => write!(f, "Compression error: {}", e),
            SyncError::InvalidFormat(e) => write!(f, "Invalid blob format: {}", e),
            SyncError::InvalidVersion(v) => write!(f, "Unsupported blob version: {}", v),
            SyncError::NetworkError(e) => write!(f, "Network error: {}", e),
            SyncError::RelayError(e) => write!(f, "Relay error: {}", e),
            SyncError::NotPaired => write!(f, "Device is not paired"),
            SyncError::RestoreFailed(e) => write!(f, "Restore failed: {}", e),
        }
    }
}

impl std::error::Error for SyncError {}

const BLOB_VERSION: u8 = 0x01;
const NONCE_SIZE: usize = 24;

/// Generate a 256-bit random sync key, returned as base64.
pub fn generate_sync_key() -> String {
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    BASE64.encode(key)
}

/// Decode a base64-encoded sync key into raw bytes.
pub fn decode_sync_key(key_b64: &str) -> Result<[u8; 32], SyncError> {
    let bytes = BASE64.decode(key_b64).map_err(|_| SyncError::InvalidKey)?;
    bytes.try_into().map_err(|_| SyncError::InvalidKey)
}

/// Encrypt a database snapshot.
///
/// Blob format: [version 1B][nonce 24B][ciphertext of (timestamp 8B + db_size 4B + zstd(data))]
pub fn encrypt_snapshot(data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, SyncError> {
    let cipher = XChaCha20Poly1305::new(key.into());

    // Compress the database snapshot
    let compressed =
        zstd::encode_all(data, 3).map_err(|e| SyncError::CompressionError(e.to_string()))?;

    // Build plaintext envelope: timestamp (8B BE) + original size (4B BE) + compressed data
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let db_size = data.len() as u32;

    let mut plaintext = Vec::with_capacity(8 + 4 + compressed.len());
    plaintext.extend_from_slice(&timestamp.to_be_bytes());
    plaintext.extend_from_slice(&db_size.to_be_bytes());
    plaintext.extend_from_slice(&compressed);

    // Generate random nonce
    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);

    // Encrypt (ciphertext includes 16-byte Poly1305 auth tag)
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_slice())
        .map_err(|_| SyncError::InvalidKey)?;

    // Build final blob: version + nonce + ciphertext
    let mut blob = Vec::with_capacity(1 + NONCE_SIZE + ciphertext.len());
    blob.push(BLOB_VERSION);
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ciphertext);

    Ok(blob)
}

/// Decrypt an encrypted snapshot blob.
///
/// Returns (decompressed database bytes, unix timestamp).
pub fn decrypt_snapshot(blob: &[u8], key: &[u8; 32]) -> Result<(Vec<u8>, u64), SyncError> {
    // Minimum: 1 (version) + 24 (nonce) + 16 (auth tag) + 12 (timestamp + size)
    if blob.len() < 1 + NONCE_SIZE + 16 + 12 {
        return Err(SyncError::InvalidFormat("blob too short".into()));
    }

    let version = blob[0];
    if version != BLOB_VERSION {
        return Err(SyncError::InvalidVersion(version));
    }

    let nonce = XNonce::from_slice(&blob[1..1 + NONCE_SIZE]);
    let ciphertext = &blob[1 + NONCE_SIZE..];

    let cipher = XChaCha20Poly1305::new(key.into());
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| SyncError::DecryptionFailed)?;

    if plaintext.len() < 12 {
        return Err(SyncError::InvalidFormat("decrypted payload too short".into()));
    }

    // Extract timestamp and original DB size
    let timestamp = u64::from_be_bytes(plaintext[0..8].try_into().unwrap());
    let _db_size = u32::from_be_bytes(plaintext[8..12].try_into().unwrap());

    // Decompress
    let decompressed = zstd::decode_all(&plaintext[12..])
        .map_err(|e| SyncError::CompressionError(e.to_string()))?;

    Ok((decompressed, timestamp))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_generation_produces_32_bytes() {
        let key_b64 = generate_sync_key();
        let key = decode_sync_key(&key_b64).unwrap();
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = decode_sync_key(&generate_sync_key()).unwrap();
        let data = b"CREATE TABLE test; INSERT INTO test VALUES (1, 'hello');";

        let blob = encrypt_snapshot(data, &key).unwrap();
        let (decrypted, timestamp) = decrypt_snapshot(&blob, &key).unwrap();

        assert_eq!(decrypted, data);
        assert!(timestamp > 0);
    }

    #[test]
    fn wrong_key_fails_decryption() {
        let key1 = decode_sync_key(&generate_sync_key()).unwrap();
        let key2 = decode_sync_key(&generate_sync_key()).unwrap();
        let data = b"secret database content";

        let blob = encrypt_snapshot(data, &key1).unwrap();
        let result = decrypt_snapshot(&blob, &key2);

        assert!(matches!(result, Err(SyncError::DecryptionFailed)));
    }

    #[test]
    fn corrupted_blob_fails() {
        let key = decode_sync_key(&generate_sync_key()).unwrap();
        let data = b"test data";

        let mut blob = encrypt_snapshot(data, &key).unwrap();
        // Corrupt a byte in the ciphertext
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;

        let result = decrypt_snapshot(&blob, &key);
        assert!(matches!(result, Err(SyncError::DecryptionFailed)));
    }

    #[test]
    fn invalid_version_rejected() {
        let key = decode_sync_key(&generate_sync_key()).unwrap();
        let data = b"test";

        let mut blob = encrypt_snapshot(data, &key).unwrap();
        blob[0] = 0xFF; // invalid version

        let result = decrypt_snapshot(&blob, &key);
        assert!(matches!(result, Err(SyncError::InvalidVersion(0xFF))));
    }

    #[test]
    fn too_short_blob_rejected() {
        let key = decode_sync_key(&generate_sync_key()).unwrap();
        let result = decrypt_snapshot(&[0x01, 0, 0], &key);
        assert!(matches!(result, Err(SyncError::InvalidFormat(_))));
    }
}
