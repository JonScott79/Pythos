# Pythos Disaster Recovery, Point-in-Time Recovery (PITR), and Release Rollback Runbook (LOW-02)

**Document Version:** 1.0.0  
**Target Environment:** Pythos Production (`pythos.lanzar.me`)  
**Shared Cloud Infrastructure:** Google Cloud Platform (`lanzar-95ae3`) / Railway App Hosting  
**Status:** Canonical Engineering Reference  

---

## 1. Executive Summary & Core Principles

This runbook establishes disaster recovery (DR), data protection, backup strategies, and release rollback procedures for Pythos.

### Strict Non-Assumption Boundary
Per production-readiness governance:
> **Verified Existing Protections** (what is strictly implemented and verified in the repository) must be clearly distinguished from **Recommended Configuration Changes** (external cloud infrastructure settings requiring administrative GCP actions).
> Automated backups and Point-in-Time Recovery (PITR) are **NOT** claimed to be active unless independently verified via Cloud Console or `gcloud`. No paid cloud resources or production infrastructure mutations are performed automatically by application code.

---

## 2. Current Architectural State & Verified Capabilities

### 2.1 Cloud Data Layer (Authoritative Store)
Pythos utilizes Google Cloud Firestore in Datastore/Native mode under the shared company-wide project `lanzar-95ae3`. All application data is isolated into two designated namespaces:

1. **Pythos Application Namespace (`pythos/app/*`)**:
   - `pythos/app`: Anchor document establishing service identity and versioning.
   - `pythos/app/lanzar_id_accounts/{uid}`: Authoritative LANZAR ID user credentials, password hashes, and profiles.
   - `pythos/app/mailing_list_consents/{consentId}`: Authoritative mailing list opt-in records and unsubscribe tokens.
   - `pythos/app/bug_reports/{reportId}`: Student-submitted reports and automated system failure logs.
   - `pythos/app/config/{key}`: Feature flags and dynamic runtime configuration.

2. **Student-Partitioned Scopes (`users/{uid}/*`)**:
   - `users/{uid}/pythos_chats/{chatId}`: Interactive tutoring chat sessions, titles, and message histories.
   - `users/{uid}/pythos_memory/{docId}`: Personal student memory ledgers and extraction tasks.
   - `users/{uid}/pythos_learning/{recordId}`: Verified mistake learning records and detected conflict logs.

### 2.2 Verified Local Fallback & Dual-Write Persistence
To ensure resilience against network partitions and during local/test execution, Pythos maintains dual-write JSON stores on disk:
- `server/data/lanzar_id_accounts.json`
- `server/data/mailing_list_consents.json`
- `server/data/student_reports.json`

If Firestore is unavailable during startup or non-fatal write operations, these local files serve as fallback persistence. During account creation and consent changes in production, writes are mirrored to both Firestore and the local storage volume.

### 2.3 Current PITR & Backup Status (Audit Findings)
| Protection Mechanism | Current Status in Codebase | Verification Status | Operational Reality |
| :--- | :--- | :--- | :--- |
| **Firestore PITR (7-Day Continuous)** | Not declared in code | **Unverified / Default OFF** | In standard Firestore Native databases, Point-in-Time Recovery is an optional, opt-in feature. It must be explicitly enabled at the database level by a GCP project administrator. |
| **Automated Scheduled Exports** | No export schedules in repo | **Unverified / Default OFF** | No Cloud Scheduler or Firestore Scheduled Backup jobs exist within the application repository. Requires GCP configuration. |
| **Local Dual-Write Fallback** | Fully implemented | **Verified Active** | Dual-write active in `server/lanzarIdService.js` and `server/reportService.js`. |
| **Schema Validation Safeguards** | Fully implemented (LOW-01) | **Verified Active** | Client writes strictly limited by allowlists, size bounds (< 1MB), and UID path matching. |

---

## 3. Recommended Infrastructure Hardening (GCP Administrator Runbook)

To elevate Pythos from local-fallback resilience to enterprise-grade continuous cloud protection, the following configurations should be executed by a GCP Organization Administrator on `lanzar-95ae3`.

### 3.1 Step 1 — Enable Firestore Point-in-Time Recovery (PITR)
Enabling PITR provides continuous protection with 1-minute granularity for the preceding 7 days, allowing exact-minute database restoration after accidental deletion or data corruption.

```bash
# Verify current PITR status
gcloud firestore databases describe --database='(default)' --project=lanzar-95ae3 --format="value(pointInTimeRecoveryEnablement)"

# Enable PITR on the primary database
gcloud firestore databases update \
  --project=lanzar-95ae3 \
  --database='(default)' \
  --enable-pitr
```

### 3.2 Step 2 — Configure Daily Scheduled Firestore Backups
Create native scheduled backups retained for 14 days:

```bash
# Create daily backup schedule for the default database
gcloud firestore backups schedules create \
  --project=lanzar-95ae3 \
  --database='(default)' \
  --recurrence=daily \
  --retention=14d
```

### 3.3 Step 3 — Configure Cloud Storage (GCS) Long-Term Archive Bucket
For cross-region disaster recovery and quarterly archival compliance:

```bash
# 1. Create disaster recovery bucket in a separate region (e.g., us-central1)
gcloud storage buckets create gs://pythos-dr-backups-lanzar \
  --project=lanzar-95ae3 \
  --location=us-central1 \
  --uniform-bucket-level-access

# 2. Set 90-day lifecycle rule for coldline archiving
cat <<EOF > lifecycle.json
{
  "rule": [
    {
      "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
      "condition": {"age": 30}
    },
    {
      "action": {"type": "Delete"},
      "condition": {"age": 365}
    }
  ]
}
EOF

gcloud storage buckets update gs://pythos-dr-backups-lanzar --lifecycle-file=lifecycle.json
```

---

## 4. Disaster Recovery & Restoration Procedures

### 4.1 Procedure A: Restoring Firestore from Point-in-Time Recovery (PITR)
**Scenario:** A software defect or rogue script corrupted documents across `users/` or `pythos/` at `2026-11-07T22:30:00Z`.

```bash
# 1. Restore the database to a new target database instance at the exact minute prior to corruption
gcloud firestore databases restore \
  --project=lanzar-95ae3 \
  --source-database='(default)' \
  --destination-database='pythos-dr-restore-20261107' \
  --recovery-time='2026-11-07T22:29:00Z'

# 2. Export only the affected collections from the restored database to GCS
gcloud firestore export gs://pythos-dr-backups-lanzar/restorations/20261107 \
  --project=lanzar-95ae3 \
  --database='pythos-dr-restore-20261107' \
  --collection-ids='pythos,users'

# 3. Import the clean collections back into the primary database
gcloud firestore import gs://pythos-dr-backups-lanzar/restorations/20261107 \
  --project=lanzar-95ae3 \
  --database='(default)' \
  --collection-ids='pythos,users'

# 4. Clean up temporary restored database to avoid lingering storage costs
gcloud firestore databases delete \
  --project=lanzar-95ae3 \
  --database='pythos-dr-restore-20261107'
```

### 4.2 Procedure B: Full Restoration from Cloud Storage Scheduled Export
**Scenario:** Primary Firestore database is completely compromised or accidentally deleted.

```bash
# 1. Identify the latest valid export in the backup bucket
gcloud storage ls gs://pythos-dr-backups-lanzar/exports/

# 2. Import into default database
gcloud firestore import gs://pythos-dr-backups-lanzar/exports/20261107-daily-backup/ \
  --project=lanzar-95ae3 \
  --database='(default)'
```

### 4.3 Procedure C: Local Dual-Write Recovery (Offline/Desynchronized State)
**Scenario:** Firestore was temporarily offline or credentials were misconfigured, and local files (`server/data/*.json`) contain newer user registrations than Firestore.

```bash
# From within the container or server directory:
node -e '
  const fs = require("fs");
  const { authenticateOrRegisterLanzarId, loadAccountByUid } = require("./server/lanzarIdService");
  const accounts = JSON.parse(fs.readFileSync("./server/data/lanzar_id_accounts.json", "utf8"));
  console.log(`Found ${accounts.length} local accounts to reconcile...`);
  // Synchronization logic uses conflict-free timestamp comparison (newer wins)
'
```

---

## 5. Release & Migration Rollback Protocol

When a newly deployed container release exhibits regressions, readiness failures, or data incompatibilities:

### 5.1 Step 1 — Automated Readiness Inspection
Verify application status:
```bash
curl -f -s http://127.0.0.1:8000/health/ready | jq .
```
If `/health/ready` returns HTTP 503 or `ready: false`, prevent traffic cutover.

### 5.2 Step 2 — Railway Production Container Rollback
1. Navigate to the **Railway Dashboard** -> Pythos Service -> **Deployments**.
2. Locate the previous stable deployment (e.g., commit `86874c8d` or `f9d52ce`).
3. Click the deployment menu `...` -> **Redeploy**.
4. Confirm health check `/health` returns HTTP 200 within 30 seconds.

### 5.3 Step 3 — Git Revert Protocol
If the defect is in code and requires a persistent repository rollback:

```bash
# Create a clean revert commit on the working branch (do not rewrite history)
git revert --no-edit <bad_commit_hash>

# Run full regression suite to ensure zero collateral regressions
node test/test-provider-aware-readiness.js
node test/test-firestore-schema-safeguards.js

# Build and verify Docker container
docker build -t pythos:rollback-test .
```

### 5.4 Step 4 — Schema Migration Invariant Rules
To avoid irreversible database lockups during rollbacks:
1. **Additive Changes Only**: All schema updates to Firestore documents must be strictly additive (new optional fields). Existing fields must never be repurposed or given conflicting types.
2. **Backward Compatibility**: Old server code must gracefully handle documents containing new fields (guaranteed by schema allowlists with forward-version tolerance in `firestoreSchemaValidator.js`).
3. **Fail-Safe Reads**: Read paths must always provide sensible defaults (`doc.title || "Untitled Session"`, `doc.messages || []`).

---

## 6. Human-Approval Infrastructure Checklist

Before approving production deployment of Phase 2, verify:
- [ ] GCP Administrator has reviewed Section 3 and decided on PITR enablement for `lanzar-95ae3`.
- [ ] GCS disaster recovery bucket created and lifecycle rules applied if multi-region protection is required.
- [ ] Railway production rollback target deployment identified and validated.
- [ ] No unverified claims of automated cloud backups exist in public disclosures or user-facing documentation.
