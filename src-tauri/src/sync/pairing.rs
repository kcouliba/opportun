use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64URL, Engine};
use serde::{Deserialize, Serialize};

use super::crypto::SyncError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingPayload {
    pub sync_key: String,   // base64-encoded 256-bit key
    pub device_id: String,  // UUID of the initiating device
    pub relay_url: String,
}

/// Encode a pairing payload into a shareable text code (~120 chars).
pub fn generate_pairing_code(payload: &PairingPayload) -> Result<String, SyncError> {
    let json = serde_json::to_string(payload)
        .map_err(|e| SyncError::InvalidFormat(e.to_string()))?;
    Ok(B64URL.encode(json.as_bytes()))
}

/// Decode a text code back into a pairing payload.
pub fn parse_pairing_code(code: &str) -> Result<PairingPayload, SyncError> {
    let trimmed = code.trim();
    let bytes = B64URL
        .decode(trimmed)
        .map_err(|_| SyncError::InvalidFormat("invalid pairing code encoding".into()))?;
    serde_json::from_slice(&bytes)
        .map_err(|_| SyncError::InvalidFormat("invalid pairing code content".into()))
}

/// Generate a QR code PNG from a pairing code string.
pub fn generate_qr_png(code: &str) -> Result<Vec<u8>, SyncError> {
    use image::Luma;
    use qrcode::QrCode;

    let qr = QrCode::new(code.as_bytes())
        .map_err(|e| SyncError::InvalidFormat(format!("QR generation failed: {}", e)))?;

    let img = qr.render::<Luma<u8>>().quiet_zone(true).build();
    let mut png_bytes = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_bytes);
    img.write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| SyncError::InvalidFormat(format!("PNG encoding failed: {}", e)))?;

    Ok(png_bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_code_roundtrip() {
        let payload = PairingPayload {
            sync_key: "dGVzdGtleQ==".to_string(),
            device_id: "550e8400-e29b-41d4-a716-446655440000".to_string(),
            relay_url: "https://relay.opportun.app".to_string(),
        };

        let code = generate_pairing_code(&payload).unwrap();
        let decoded = parse_pairing_code(&code).unwrap();

        assert_eq!(decoded.sync_key, payload.sync_key);
        assert_eq!(decoded.device_id, payload.device_id);
        assert_eq!(decoded.relay_url, payload.relay_url);
    }

    #[test]
    fn invalid_code_rejected() {
        assert!(parse_pairing_code("not-valid!!!").is_err());
        assert!(parse_pairing_code("").is_err());
    }

    #[test]
    fn qr_code_produces_png() {
        let code = "test-pairing-code-data";
        let png = generate_qr_png(code).unwrap();
        // PNG magic bytes
        assert!(png.starts_with(&[0x89, 0x50, 0x4E, 0x47]));
    }
}
