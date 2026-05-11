# ADR-0003: Reflog external anchor + checkpoint format

## Status
Proposed

## Context

ADR-0001 established a SQLite-backed, hash-chained reflog with INSERT-only enforcement via `BEFORE UPDATE/DELETE` triggers (`mcp/src/quarantine/reflog.ts:83–87`, schema in ADR-0001). That design is tamper-evident against software bugs inside Mafia but not against an adversary (or a broken migration) with direct DB access — they can drop `reflog` and rewrite the table with an internally consistent chain. PRD §3.2 claims "provable history"; the current implementation does not deliver that claim if the SQLite file itself is under attacker control.

Two structural problems compound this:

1. **Tamper-evidence is local only.** No externally observable proof that a chain root existed at a given time. An adversary who controls the file can rewrite history undetected.
2. **Reflog grows unbounded.** `verifyChain` in both TS (`mcp/src/quarantine/reflog.ts:76`) and Rust (`core-rust/core/src/reflog.rs:103`) does a full O(N) scan. Cheap today; structural problem at iOS scale. No GC path exists.

ADR-0002 ported `verify_chain` and `canonical_json` to Rust (`core-rust/core/src/reflog.rs`). The checkpoint scheme decided here must be byte-reproducible between both implementations without new primitives — `sha256_hex` and `canonical_json` are already shared.

---

## Decision

### A. External anchor: RFC 3161 + checkpoint Merkle roots (recommended)

**Chosen approach:** RFC 3161 timestamping against a public TSA (FreeTSA.org for development; DigiCert or Sectigo TSA for production). Each checkpoint (see §B) produces a Merkle root; that root hash is submitted to the TSA, which returns a signed `TimeStampToken` (TST). The TST is stored in `reflog_checkpoints.anchor_proof`.

**Why RFC 3161 over the alternatives:**

| Option | Privacy posture | Trust model | Cost | Practical fit |
|---|---|---|---|---|
| RFC 3161 TSA | Hash only leaves the device — no email content, no action metadata, no user identity | Third-party TSA vouches for time; private key is TSA's, not ours | Free (FreeTSA) to ~$0.01/stamp (commercial) | Good match for PRD §6.1 on-device-by-default |
| Sigstore / Rekor | Public append-only log is world-readable; entries include hash + optional metadata | Strongest trust (Certificate Transparency-style) | Free | Privacy problem: the act of checkpointing is observable even with hashed payloads. Rekor links entries to an OIDC identity. Incompatible with §6.1 and consumer privacy posture. |
| Self-hosted anchor | Full control over log | Weakest — we control both the data and the anchor; offers no meaningful external proof | Infra cost + ongoing ops | No credible tamper-evidence claim when both ends are under our control. |

RFC 3161 submits only a hash (the Merkle root) — no content, no user identity, no timing patterns beyond "a hash was submitted." The TSA's signed token proves the hash existed no later than the timestamp. This is the minimum data exposure consistent with §6.1.

**Phase 4 / monetization note (PRD §12):** The anchor proof is stored locally per device. If the product eventually offers a hosted restore tier or audit export, the TST is portable and verifiable without contacting Mafia infrastructure. That de-risks the §12 paid-tier "deep-restore" story — users can independently verify their vault history using standard RFC 3161 tools.

**Offline behavior:** checkpointing is best-effort. If the TSA is unreachable, the checkpoint is written to `reflog_checkpoints` with `anchor_proof = NULL`. The chain is still locally verifiable; the external anchor is layered tamper-evidence, not a gate on normal operation. See Open Questions §1 for UX detail.

---

### B. Checkpoint format

#### Trigger

A checkpoint is triggered by whichever fires first:
- **N entries:** 1,024 new reflog entries since the last checkpoint.
- **T time:** 24 hours since the last checkpoint.

Rationale: 1,024 balances Merkle tree depth (10 levels) against frequency. 24h ensures freshness even on low-volume installs. Both thresholds are runtime-configurable; these are defaults.

#### Merkle tree construction

1. Collect all reflog entries `e[start_seq..end_seq]` (inclusive), ordered by `seq ASC`.
2. Compute each leaf: `sha256_hex(canonical_json(entry))` — using the same `canonical_json` already in both TS and Rust (`mcp/src/quarantine/reflog.ts:111`, `core-rust/core/src/reflog.rs:59`).
3. If the leaf count is not a power of 2, pad with the last leaf repeated until the next power of 2. This keeps tree shape deterministic across implementations.
4. Build a binary Merkle tree bottom-up: each inner node = `sha256_hex(left_child_hash + right_child_hash)` (concatenation, no separator). Root hash is the result.
5. Submit the root hash to the TSA; store the returned TST as the anchor proof.

**Cross-language reproducibility contract:** both implementations must produce identical leaf hashes and root hashes for identical input. The only primitives used are `canonical_json` + `sha256_hex`, both already ported and cross-tested (`mcp/tests/cross-language-reflog.test.ts`). The padding rule (repeat last leaf) must be explicitly tested in the cross-language suite.

#### Schema

New table, additive migration:

```sql
CREATE TABLE reflog_checkpoints (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  root_hash  TEXT    NOT NULL,           -- hex sha256 Merkle root
  start_seq  INTEGER NOT NULL,           -- first reflog.seq covered (inclusive)
  end_seq    INTEGER NOT NULL,           -- last reflog.seq covered (inclusive)
  ts         INTEGER NOT NULL,           -- unix seconds at checkpoint creation
  anchor_proof TEXT                      -- opaque RFC 3161 TST (DER, base64-encoded); NULL if TSA unreachable
);
CREATE INDEX idx_reflog_checkpoints_end ON reflog_checkpoints(end_seq);
```

`anchor_proof` is treated as an opaque blob by Mafia core; a separate verifier (or the user's own RFC 3161 tool) can decode and validate it against the TSA's public certificate.

#### Truncation

Pre-checkpoint entries **may** be pruned from the `reflog` table (moved to cold storage or deleted) once:
- The checkpoint row covering them exists with a non-NULL `anchor_proof`, AND
- The checkpoint's `anchor_proof` has been independently verified against the TSA certificate at least once.

`verify_chain` on a truncated log walks back to the most recent checkpoint and verifies against its published root: it checks that the first surviving entry's `prev_hash` matches the checkpoint's `root_hash` (see worked example below). The external `anchor_proof` independently certifies that root existed at the recorded time.

Entries with `purge_after` still in the future must not be truncated regardless of checkpoint coverage — they may still be needed for restore.

An opt-out flag `retain_full_log = true` (see Open Questions §3) prevents truncation entirely for users who want the complete audit trail.

---

## Worked example: 4 entries, truncated log verification

Entries written to `reflog` (seq 1–4):

```
seq=1  prev_hash=""          entry_hash=H1   payload=P1
seq=2  prev_hash=H1          entry_hash=H2   payload=P2
seq=3  prev_hash=H2          entry_hash=H3   payload=P3
seq=4  prev_hash=H3          entry_hash=H4   payload=P4
```

Checkpoint covering seq 1–4:

```
leaf[1] = sha256(canonical_json(entry_1))   → L1
leaf[2] = sha256(canonical_json(entry_2))   → L2
leaf[3] = sha256(canonical_json(entry_3))   → L3
leaf[4] = sha256(canonical_json(entry_4))   → L4

inner[A] = sha256(L1 + L2)
inner[B] = sha256(L3 + L4)
root     = sha256(inner[A] + inner[B])      → R
```

`reflog_checkpoints` row: `{ root_hash: R, start_seq: 1, end_seq: 4, anchor_proof: <TST> }`.

After truncation, seq 1–4 are removed from `reflog`. A new action writes seq=5 with `prev_hash=H4`.

**verify_chain on the truncated log:**

1. Load `reflog_checkpoints` — find checkpoint covering seq 1–4, root = R.
2. The oldest surviving entry is seq=5 with `prev_hash=H4`.
3. Recompute Merkle root over the checkpoint's [start_seq, end_seq] range from the entries in cold storage (or from the stored `entry_hash` values alone, if only hashes were retained): confirm root = R.
4. Confirm R matches `root_hash` in the checkpoint row (and that `anchor_proof` verifies against TSA cert).
5. Confirm seq=5's `prev_hash` = H4, the last hash in the reconstructed chain.
6. Continue normal chain walk from seq=5 onward.

If cold storage was fully dropped and only the checkpoint row survives, step 3 reduces to trusting the checkpoint's `root_hash` — tamper-evidence then rests entirely on the TSA anchor.

---

## Consequences

### Positive
- `verify_chain` on a trimmed log is O(K) where K = entries since the last checkpoint, not O(all-time N).
- RFC 3161 provides third-party-verifiable proof of chain state at each checkpoint without leaking content or user identity.
- Anchor proof is self-contained — users can verify independently using any RFC 3161 tool.
- Truncation enables a real cold-tier path (ADR-0001 open question 6) without losing audit trail.

### Negative
- Checkpoint logic is new surface area that both TS and Rust must implement and keep in sync.
- TSA dependency: offline operation degrades to local-only tamper evidence (accepted; see trigger design).
- FreeTSA.org is free but does not carry SLA guarantees. Production deployment needs a paid TSA or DigiCert.
- RFC 3161 TSTs carry an expiration on the TSA's signing cert; long-term verification requires retaining the TSA cert chain.

### Neutral
- Padding rule (repeat last leaf) adds one bit of complexity but keeps tree shape deterministic; requires explicit cross-language test.
- Cold-tier policy (drop body vs. drop entries entirely) is out of scope here — truncation only removes the `reflog` rows; `email_snapshots` body blobs follow their own purge logic.

---

## Alternatives considered

| Approach | Why rejected |
|---|---|
| Sigstore / Rekor | Public append-only log; every checkpoint creates an observable, world-readable entry. Incompatible with PRD §6.1 on-device-by-default and consumer privacy posture. |
| Self-hosted anchor service | We control both data and anchor — no credible external tamper-evidence claim. Adds infra cost and ops burden. |
| Blockchain anchoring (OriginStamp-style) | Similar privacy properties to RFC 3161 for hashes only; higher latency, variable cost, more exotic dependency. No meaningful advantage over TSA for this use case. |
| No external anchor, just Merkle checkpoints locally | Solves the O(N) scan problem but does not address the core tamper-evidence gap (the adversary can rewrite both data and checkpoint table). |
| Anchor every reflog entry individually | Cost per entry is impractical; RFC 3161 is designed for aggregation exactly like this. |

---

## References

- ADR-0001 §Open questions 1–7, schema `reflog` table
- ADR-0002 §Addendum, `core-rust/core/src/reflog.rs` — `verify_chain`, `canonical_json`, `compute_entry_hash`
- PRD §3.2 Trust through Reversibility, §6.1 Privacy, §12 Monetization
- `mcp/src/quarantine/reflog.ts` — `verifyChain` (TS reference impl)
- RFC 3161 — Internet X.509 PKI Time-Stamp Protocol (TSP): https://www.ietf.org/rfc/rfc3161.txt
- FreeTSA: https://www.freetsa.org/
- DigiCert TSA: https://knowledge.digicert.com/general-information/rfc3161-compliant-time-stamp-authority-server
- Crosby & Wallach 2009 — *Efficient Data Structures for Tamper-Evident Logging*

---

## Open questions

1. **UX when TSA is unreachable.** Current spec: checkpoint is written with `anchor_proof = NULL`; normal operation continues. User-visible implication: the "last anchored" timestamp shown in a future Vault audit screen would be stale. Needs a UX decision: silent degradation, informational banner, or blocking? Recommendation is silent degradation with a low-priority status indicator — blocking would make offline use unusable.

2. **Multi-device sync (V2+).** Each device owns its own DB connection and writes its own reflog. When two devices sync, their reflogs are independent chains — the checkpoint Merkle roots are not the same. A merged view needs either a cross-device super-chain (expensive) or a per-device chain model where each device's checkpoints are anchored independently and sync is tracked at the `email_actions` level. This ADR does not resolve multi-device; flag it for the V2 sync design.

3. **Opt-out of truncation.** PRD §5.5 frames the cumulative reflog as an "investment surface" — "you've recovered 47 GB across 6 months — see timeline." Users who want every action visible since install must be able to disable truncation. Proposed: a `retain_full_log` user setting (default off) that suppresses the truncation step while still writing checkpoints. Storage cost must be surfaced in the Settings UI when this is on.
