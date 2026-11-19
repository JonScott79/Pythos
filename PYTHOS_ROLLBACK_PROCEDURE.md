# PYTHOS — ROLLBACK PROCEDURE

**Protected Production Branch (`master`):** `6c204be`  
**Production Railway Project:** `Pythos` (`1f379db1-fd37-4125-b512-045d14dc056d`) | Service `0c0b7257-6de4-404d-a404-2f57c3328c80`  
**Staging Railway Project:** `pythos-staging` (`ab78d55a-6e25-421d-92a8-e298005f6b58`) | Service `f6c92158-3f0d-40db-b27c-ccdd4d40b198`

---

## 1. Railway Deployment Rollback (Fastest — < 2 Minutes)

1. Open Railway Dashboard -> target project (`pythos-staging` or `Pythos`).
2. Select service `Pythos` -> **Deployments**.
3. Locate the last known healthy `[SUCCESS]` deployment (for `pythos-staging`, prior baseline `f8e3175d-ef95-4c1a-bace-eb6b301a8f9e` on `d482f16`; for production `Pythos`, the active pre-merge deployment on `6c204be`).
4. Click **Rollback** on that deployment.
5. Verify `GET /health` and `GET /health/ready` return `200 OK`.

---

## 2. Emergency Verifier Daemon Disable (Zero-Code Mitigation)

If the persistent SymPy verifier worker pool (`VerifierWorker`) exhibits unexpected issues in a container environment:
1. Set `VERIFIER_DAEMON_DISABLED=true` in Railway Variables for the affected service.
2. Railway automatically redeploys using the original one-shot `verifier.py` subprocess path (`casQueue`), preserving 100% of mathematical verification semantics.

---

## 3. Git Revert on `master` (If Needed Post-Merge)

```bash
git checkout master
git revert -m 1 <merge-commit-sha>
git push origin master
```
*(Never force-push `master`.)*
