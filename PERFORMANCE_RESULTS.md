# Pythos AI — Performance & Initial Load Optimization Results (`PERFORMANCE_RESULTS.md`)

**Baseline:** `v1.8.52` (commit `181f5f2`)  
**Remediation Target:** `v1.8.53` (Phase 2)  
**Measurement Tool:** Lighthouse 13.6.0 Headless Chromium (`scratch/lh_before_*.json` vs. `scratch/lh_after_*.json`) & `test-phase2-performance.js` (13/13 passed)

---

## 1. Before vs. After Lighthouse Metrics

| Metric | Mobile Before (`v1.8.52`) | Mobile After (`v1.8.53`) | Desktop Before (`v1.8.52`) | Desktop After (`v1.8.53`) | Target |
|---|---:|---:|---:|---:|---:|
| **Performance Score** | 47 / 100 | **100 / 100** | 78 / 100 | **99 / 100** | >= 85 Mobile / >= 95 Desktop |
| **Largest Contentful Paint (LCP)** | 8.0 s (`8,010 ms`) | **1.0 s (`1,019 ms`)** | 4.2 s (`4,152 ms`) | **0.8 s (`817 ms`)** | < 2.5 s Mobile |
| **First Contentful Paint (FCP)** | 8.0 s (`8,010 ms`) | **1.0 s (`1,019 ms`)** | 0.6 s (`601 ms`) | **0.2 s (`246 ms`)** | < 1.8 s |
| **Total Blocking Time (TBT)** | 420 ms | **70 ms (`74 ms`)** | 0 ms | **0 ms** | < 200 ms |
| **Cumulative Layout Shift (CLS)** | 0 | **0.033** | 0.046 | **0.054** | < 0.1 |
| **Total Network Transfer Size** | 4,655.1 KB (4.55 MB) | **667.4 KB (0.65 MB)** | 4,506.1 KB (4.40 MB) | **667.4 KB (0.65 MB)** | >= 80% reduction |

> **Summary:** Total initial page weight dropped by **85.7%** (`4.55 MB` -> `0.65 MB`), and Mobile LCP improved by **87.3%** (`8,010 ms` -> `1,019 ms`).

---

## 2. Root Causes Identified & Remediated

### 2.1 Render-Blocking Stylesheets, Empty Initial `#output`, and Eager Firebase Auth Reset (Phase 2.1)
- **Root Cause:** `#output` was empty in static HTML until `app.js` downloaded 3 remote Firebase ES modules (`firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`) and fired `onAuthStateChanged`, which wiped `#output` and re-rendered `#welcomeOracleCard` late in the load lifecycle. External Google Fonts and KaTeX CSS were also render-blocking in `<head>`.
- **Fix:**
  - Pre-rendered `#welcomeOracleCard` directly in `index.html` with `width="56" height="56" fetchpriority="high"` on `assets/pythos_avatar.jpg`.
  - Updated `clearChatUI()` in `app.js` to hydrate existing starter chips in-place without destroying the pre-rendered DOM node.
  - Deferred Firebase SDK dynamic imports (`ensureFirebaseInitialized()`) until after initial paint (`2,500 ms` post-load or on explicit login click).
  - Loaded Google Fonts and KaTeX stylesheets non-blockingly (`media="print"` promoted to `media="all"` on startup).

### 2.2 Asset Compression & On-Demand Lazy Loading (Phase 2.2)
- **Image Optimization:** Compressed `assets/pythos_avatar.jpg` from `548 KB` (`1024x1024`) to `6.1 KB` (`160x160`) and `assets/math_bg.jpg` from `1,017 KB` (`1408x768`) to `57.7 KB` (`704x384`), saving **1.50 MB** on initial load while generating `.webp` variants.
- **Lazy-Loaded Heavy Libraries:**
  - Removed eager `<script defer src="...heic2any.min.js">` (`1.32 MB`) and `<script defer src="...mathlive.min.js">` (`224 KB`) from `index.html`.
  - Added `ensureHeic2AnyLoaded()` in `app.js` (loaded only when a user attaches a `.heic`/`.heif` photo) and `ensureMathLiveLoaded()` (loaded only when the user opens the Visual Equation Builder).
  - Switched unminified `math.js` to `math.min.js` and deferred hidden KaTeX palette rendering until the Equation Builder opens.
  - Deferred Microsoft Clarity initialization (`js/analytics.js`) until `3,500 ms` after page load.

### 2.3 Script Consolidation & Gzip Streaming (Phase 2.3)
- Consolidated 22 separate `<script defer src="vizEngine/...">` tags into a single `vizEngine/vizEngine.bundle.js` (`160 KB` raw, `~38 KB` gzipped), eliminating 21 waterfall HTTP requests.
- Enabled streaming `gzip` compression (`Content-Encoding: gzip`) in `staticServer.js` for all text/HTML/JS/CSS/JSON/SVG assets.
