//! Reflog primitives: canonical JSON + hash-chain verification.
//!
//! Mirror of `Mafia/src/quarantine/reflog.ts` (`canonicalJson` + `verifyChain`).
//! These functions are pure and deterministic — given the same input on
//! either side of the FFI, output must be identical. That property is what
//! lets us cross-check the chain integrity across TS and Rust.
//!
//! Hash format (must match TS exactly):
//!   entry_hash = SHA256(prev_hash || "|" || canonical_json(payload))
//!
//! Genesis row has prev_hash = "".

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// One entry in the reflog. Shape mirrors the SQLite row plus a deserialized
/// payload for convenience. JS-side input comes through with strings/numbers
/// already; this struct is what gets passed into `verify_chain`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflogEntry {
    pub seq: i64,
    pub prev_hash: String,
    pub entry_hash: String,
    pub ts: i64,
    pub user_id: String,
    pub action_id: String,
    pub transition: String,
    pub payload_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifyResult {
    pub ok: bool,
    /// `seq` of the first invalid link, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broken_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

impl VerifyResult {
    pub fn ok() -> Self {
        Self { ok: true, broken_at: None, reason: None }
    }
    pub fn broken(seq: i64, reason: impl Into<String>) -> Self {
        Self { ok: false, broken_at: Some(seq), reason: Some(reason.into()) }
    }
}

/// Compute the canonical JSON string for a value: keys sorted alphabetically
/// at every depth. Must produce byte-identical output to `canonicalJson` in
/// `Mafia/src/quarantine/reflog.ts`.
///
/// Note on number formatting: serde_json prints integers without a decimal
/// (e.g. `1` not `1.0`), matching `JSON.stringify`. Floats serialize with the
/// usual rules. We do not encounter floats inside our payloads in practice;
/// if we did, parity with V8's `JSON.stringify` would need careful auditing.
pub fn canonical_json(value: &Value) -> String {
    let sorted = sort_keys(value);
    serde_json::to_string(&sorted).expect("serde_json cannot fail on Value")
}

/// Recursively sort object keys.
fn sort_keys(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = Map::new();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            for k in keys {
                out.insert(k.clone(), sort_keys(&map[k]));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(sort_keys).collect()),
        other => other.clone(),
    }
}

/// SHA-256 of a string, returned as lowercase hex.
pub fn sha256_hex(s: &str) -> String {
    let digest = Sha256::digest(s.as_bytes());
    let mut out = String::with_capacity(64);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// Compute the entry hash for a (prev_hash, canonical_payload_json) pair.
/// Format: `sha256("{prev_hash}|{payload_json}")`. Matches the TS impl byte-for-byte.
pub fn compute_entry_hash(prev_hash: &str, payload_json: &str) -> String {
    sha256_hex(&format!("{prev_hash}|{payload_json}"))
}

/// Verify the entire reflog chain. Entries must be in ascending `seq` order.
///
/// Checks:
/// 1. Genesis row's `prev_hash` is empty.
/// 2. Each subsequent row's `prev_hash` matches the previous row's `entry_hash`.
/// 3. Each row's `entry_hash` recomputes correctly from `(prev_hash, payload_json)`.
pub fn verify_chain(entries: &[ReflogEntry]) -> VerifyResult {
    if entries.is_empty() {
        return VerifyResult::ok();
    }

    if !entries[0].prev_hash.is_empty() {
        return VerifyResult::broken(entries[0].seq, "genesis prev_hash must be empty");
    }

    let mut expected_prev = String::new();
    for e in entries {
        if e.prev_hash != expected_prev {
            return VerifyResult::broken(
                e.seq,
                format!(
                    "prev_hash mismatch (expected {expected_prev}, got {})",
                    e.prev_hash
                ),
            );
        }
        let recomputed = compute_entry_hash(&e.prev_hash, &e.payload_json);
        if recomputed != e.entry_hash {
            return VerifyResult::broken(e.seq, "entry_hash mismatch — payload tampered");
        }
        expected_prev = e.entry_hash.clone();
    }

    VerifyResult::ok()
}
