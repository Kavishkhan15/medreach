# EXP-REG Task 3: Data Path & Edge Caching Staleness Audit

**Investigation**: Does edge caching of prerendered HTML shells stale healthcare availability data in MedReach?  
**Investigator / Auditor**: Research Coordinator & Fact Auditor  
**Date**: 2026-10-24  
**Target Environments**: 
- Bootstrap: `https://medreachmumbai.vercel.app`
- Tailwind: `https://medreach-tailwind.vercel.app`
- Skeleton: `https://medreach-skeleton.vercel.app`
- API Backend: `https://medreach-production.up.railway.app`
**Status**: COMPLETE  
**Definitive Verdict**: **NOT SUPPORTED** (The claimed stale-availability hazard is NOT present in this codebase)

---

## 1. Executive Summary & Definitive Verdict

### 1.1 The Claim Under Audit
Section 3.1.4 of the earlier research dossier (`10-caching-and-data-freshness-analysis.md`) stated:
> *"The Stale Availability Hazard: If bed availability counts (`icu_beds_available`), blood bank inventories (`units_available`), or ambulance dispatch statuses are baked into static prerendered HTML shells (SSG), an edge cache retention of 6.7 hours could lead acute trauma or hemorrhage patients to facilities whose critical resources have been exhausted."*

This inference arose because low-rate probing of Vercel edge nodes observed:
```http
cache-control: public, max-age=0, must-revalidate
x-vercel-cache: HIT
age: 24496 - 32596 (6.8 to 9.0 hours)
x-nextjs-prerender: 1
x-nextjs-stale-time: 300
```
From these headers, the dossier hypothesized that a multi-hour edge cache hit could present stale healthcare availability data to patients. The repository owner explicitly challenged this inference, requiring an empirical trace of the real information path.

### 1.2 Definitive Audit Verdict: NOT SUPPORTED
Following exhaustive architectural inspection of all three frontend variants (`bootstrap`, `tailwind`, `skeleton`), the shared `@medreach/core` client library, the Express backend API, and empirical low-rate HTTP probing of 22 public endpoints (15 HTML routes across 3 variants + 7 Railway API endpoints), the audit concludes:

**The stale-availability hazard is NOT SUPPORTED for this codebase.**

1. **Zero Volatile Data in HTML Shells**: Statically prerendered HTML shells served by Vercel's edge cache contain **only static structural shells, empty containers, navigation chrome, and form controls**. They contain **zero** clinical availability metrics (`icu_beds`, `units_available`, `beds_available`, `oxygen`), **zero** provider database records, and **zero** runtime state.
2. **Universal Client-Side Runtime Fetching**: All 15 healthcare discovery and emergency routes across all three variants use `"use client";` directives. Data fetching occurs strictly in React `useEffect` hooks *after* client-side DOM hydration.
3. **No Client-Side Cache Staling**: The shared API client (`packages/core/src/api.js`) explicitly enforces that *"Only simultaneous reads are shared; no completed response is cached."* In-flight requests are deduplicated, but completed reads are purged immediately.
4. **Decoupled Backend Edge Policy**: The Express backend is hosted on independent infrastructure (`railway-hikari`), completely separate from Vercel's edge CDN. Transactional and patient-facing endpoints strictly emit `Cache-Control: no-store`. Public directory endpoints do not emit multi-hour edge retention headers.
5. **Dossier Correction Requirement**: The earlier dossier inference must be corrected. The multi-hour `x-vercel-cache: HIT` applies strictly to static HTML shells (which render "Loading providers..." prior to client hydration). It must be reframed from an active defect to an architectural design-risk observation: it represents a hazard that *would* occur if a developer improperly migrated client data fetching into static server prerenders (`generateStaticParams` / SSG with baked props), but which MedReach's actual decoupled client-fetch architecture completely avoids.

---

## 2. End-to-End Information Path Trace

```
[ Patient / Browser Client ]
          |
          | 1. HTTP GET /hospitals (or /, /blood-banks, /emergency, /ambulances)
          v
+-------------------------------------------------------+
| Vercel Edge CDN (Mumbai bom1 / Cleveland cle1)        |
| - Header: cache-control: public, max-age=0, must-reval|
| - Header: x-vercel-cache: HIT (Age: ~32,000s)         |
| - Header: x-nextjs-prerender: 1                       |
+-------------------------------------------------------+
          |
          | Returns static prerendered HTML shell (<52 KB)
          | Contains: Navigation, search forms, dropdown options
          | Contains: "Loading providers...", "Search 0 facilities"
          | Contains: ZERO hospital records, ZERO bed/blood numbers
          v
[ Browser Receives Shell ]
          |
          | 2. Browser executes JavaScript bundle & hydrates React
          | 3. "use client" component mounts: useEffect() fires
          v
[ React Hook Execution ]
  - useHospitals() -> api.listHospitals()
  - ResourceDirectory -> productApi('/api/blood-banks')
  - AmbulanceDirectory -> productApi('/api/ambulances')
          |
          | 4. Runtime fetch() directly to Railway Backend API
          v
+-------------------------------------------------------+
| Railway Backend API (medreach-production.up.railway.app)|
| - Infrastructure: railway-hikari                      |
| - Middleware: security.js + publicCompression.js      |
| - Cache-Control: no-store (tracking/auth/emergency)   |
| - Cache-Control: public, no-cache (public directories)|
+-------------------------------------------------------+
          |
          | 5. Live MongoDB Atlas read (never edge-cached)
          v
[ Fresh Data Returned to Client ]
          |
          | 6. React state updated: setItems(res.data)
          | 7. Fresh availability rendered in DOM
          v
[ Patient Sees Live Availability ]
```

---

## 3. Codebase Architecture Evidence

### 3.1 Frontend Variants: Universal `"use client"` Architecture
All three frontend variants (`variants/bootstrap`, `variants/tailwind`, `variants/skeleton`) use Next.js App Router. Inspection of every route displaying availability, blood stock, bed, and ambulance information reveals:

| Route | Variant | Directive | Initial SSR State | Rendered HTML Shell Output |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Bootstrap | `"use client"` | `homeResources = null` | Static landing frame, hero image, empty directory cards |
| `/` | Tailwind | `"use client"` | `homeResources = null` | Static landing frame, hero image, empty directory cards |
| `/` | Skeleton | `"use client"` | `homeResources = null` | Static landing frame, hero image, empty directory cards |
| `/hospitals` | Bootstrap | `"use client"` | `loading: true, data: []` | `<p>Information and discovery directory for listed hospitals in Mumbai.</p>` |
| `/hospitals` | Tailwind | `"use client"` | `loading: true, data: []` | `<p>Search 0 facilities by name, specialty, facility, or type.</p>` |
| `/hospitals` | Skeleton | `"use client"` | `loading: true, data: []` | `<p>Search 0 facilities by name, specialty, facility, or type.</p>` |
| `/emergency` | Bootstrap | `"use client"` | `started = false` | Category selector & location picker; zero hospital cards rendered |
| `/emergency` | Tailwind | `"use client"` | `started = false` | Category selector & location picker; zero hospital cards rendered |
| `/emergency` | Skeleton | `"use client"` | `started = false` | Category selector & location picker; zero hospital cards rendered |
| `/blood-banks`| Bootstrap | `"use client"` | `items: [], loading: true` | `"Search blood banks Loading providers…"` |
| `/blood-banks`| Tailwind | `"use client"` | `items: [], loading: true` | `"Search blood banks Loading providers…"` |
| `/blood-banks`| Skeleton | `"use client"` | `items: [], loading: true` | `"Search blood banks Loading providers…"` |
| `/ambulances` | Bootstrap | `"use client"` | `items: [], loading: true` | `"Search ambulances Loading providers…"` |
| `/ambulances` | Tailwind | `"use client"` | `items: [], loading: true` | `"Search ambulances Loading providers…"` |
| `/ambulances` | Skeleton | `"use client"` | `items: [], loading: true` | `"Search ambulances Loading providers…"` |
| `/hospitals/[slug]`| All 3 | `"use client"` | `baseLoading: true` | `<p className="text-secondary p-4">Loading hospital details…</p>` |

### 3.2 Client API Client (`packages/core/src/api.js`)
Inspection of `packages/core/src/api.js` lines 72–89 confirms:
```javascript
// Only simultaneous reads are shared; no completed response is cached.
const pendingReads = new Map();
function req(path, opts = {}) {
  if (typeof window === "undefined" || (opts.method && opts.method !== "GET") || opts.signal) {
    if (typeof window !== "undefined" && opts.method && opts.method !== "GET") {
      pendingReads.clear();
      return performRequest(path, opts).finally(() => pendingReads.clear());
    }
    return performRequest(path, opts);
  }
  const key = JSON.stringify([path, opts]);
  if (pendingReads.has(key)) return pendingReads.get(key);
  const request = performRequest(path, opts).finally(() => {
    if (pendingReads.get(key) === request) pendingReads.delete(key);
  });
  pendingReads.set(key, request);
  return request;
}
```
**Finding**: There is zero in-memory response caching for completed reads. The Map only collapses concurrent duplicate in-flight promises. As soon as the network request resolves, the entry is deleted (`pendingReads.delete(key)`).

### 3.3 Backend Cache Headers (`backend/src/`)
Inspection of the Express backend middleware:
1. **Security Middleware (`backend/src/middleware/security.js:64-70`)**:
   ```javascript
   if (req.headers.authorization || req.cookies?.token || req.get("X-MedReach-Tracking-Token") ||
       req.path.startsWith("/api/auth/") || /^\/api\/(emergency-requests|blood-requests|tracking)(?:\/|$)/.test(req.path) ||
       /^\/api\/ambulances\/(?:book|bookings)(?:\/|$)/.test(req.path)) {
     res.set("Cache-Control", "no-store");
   }
   ```
   All sensitive, state-altering, tracking, and clinical request operations strictly emit `Cache-Control: no-store`.

2. **Public Compression Middleware (`backend/src/middleware/publicCompression.js:12-16`)**:
   ```javascript
   if (isDirectory(req) && !res.getHeader("Cache-Control")) {
     res.set("Cache-Control", "public, no-cache");
   }
   ```
   For public directories (`/api/hospitals`, `/api/blood-banks`, `/api/diagnostics`, `/api/ambulances`, `/api/jobs`), the header is set to `public, no-cache`.
   Under RFC 9111 §5.2.1.4, `no-cache` prohibits serving cached responses without origin revalidation. No multi-hour edge caching is permitted.

---

## 4. Empirical Verification & Raw Capture Data

An automated, polite, low-rate probe was executed against all 22 target public endpoints. Full response bodies and JSON header records are preserved in `/home/anonymous/medreach/research/results/datapath/captures/`.

### 4.1 HTML Document Probe Summary (Vercel Edge)

| ID | URL Route | Status | Body Size | `x-vercel-cache` | `age` (s) | Volatile Data Found | RSC Volatile Data |
| :--- | :--- | :---: | ---: | :---: | ---: | :---: | :---: |
| `bootstrap_root` | `medreachmumbai.vercel.app/` | 200 | 51,939 B | `HIT` | 32,583 | **NONE** | **NONE** |
| `bootstrap_hospitals` | `medreachmumbai.vercel.app/hospitals` | 200 | 29,850 B | `HIT` | 31,611 | **NONE** | **NONE** |
| `bootstrap_emergency` | `medreachmumbai.vercel.app/emergency` | 200 | 33,432 B | `HIT` | 31,518 | **NONE** | **NONE** |
| `bootstrap_blood_banks`| `medreachmumbai.vercel.app/blood-banks` | 200 | 29,019 B | `HIT` | 31,424 | **NONE** | **NONE** |
| `bootstrap_ambulances` | `medreachmumbai.vercel.app/ambulances` | 200 | 26,355 B | `HIT` | 31,237 | **NONE** | **NONE** |
| `tailwind_root` | `medreach-tailwind.vercel.app/` | 200 | 52,429 B | `HIT` | 32,591 | **NONE** | **NONE** |
| `tailwind_hospitals` | `medreach-tailwind.vercel.app/hospitals` | 200 | 33,827 B | `HIT` | 31,612 | **NONE\*** | **NONE** |
| `tailwind_emergency` | `medreach-tailwind.vercel.app/emergency` | 200 | 35,172 B | `HIT` | 31,519 | **NONE** | **NONE** |
| `tailwind_blood_banks` | `medreach-tailwind.vercel.app/blood-banks`| 200 | 28,843 B | `HIT` | 31,425 | **NONE** | **NONE** |
| `tailwind_ambulances` | `medreach-tailwind.vercel.app/ambulances` | 200 | 26,086 B | `HIT` | 31,239 | **NONE** | **NONE** |
| `skeleton_root` | `medreach-skeleton.vercel.app/` | 200 | 51,451 B | `HIT` | 32,596 | **NONE** | **NONE** |
| `skeleton_hospitals` | `medreach-skeleton.vercel.app/hospitals` | 200 | 30,811 B | `HIT` | 31,614 | **NONE\*** | **NONE** |
| `skeleton_emergency` | `medreach-skeleton.vercel.app/emergency` | 200 | 32,390 B | `HIT` | 31,521 | **NONE** | **NONE** |
| `skeleton_blood_banks`| `medreach-skeleton.vercel.app/blood-banks`| 200 | 28,099 B | `HIT` | 31,427 | **NONE** | **NONE** |
| `skeleton_ambulances` | `medreach-skeleton.vercel.app/ambulances` | 200 | 25,369 B | `HIT` | 31,240 | **NONE** | **NONE** |

*\*Note on `tailwind_hospitals` and `skeleton_hospitals`*: Automated regex flagged the string `"Ventilator"` twice. Inspection of the raw HTML source confirmed that this is a literal static dropdown option in the filter form: `<option value="Ventilator">Ventilator</option>`. It is not a clinical inventory count or availability record.

### 4.2 Raw HTML Grep Verification
Grep was conducted across all 15 captured HTML files for actual facility names (e.g. `Lilavati`, `King Edward Memorial`, `KEM`, `Hinduja`, `Cooper`, `Tata Memorial`) and clinical availability indicators (`icu_beds`, `beds_available`, `units_available`, `available_beds`, `occupied_beds`).
- Total occurrences of facility names in prerendered HTML: **0**
- Total occurrences of availability/stock numbers in prerendered HTML: **0**
- Total occurrences of React Server Component (RSC) serialized clinical payloads: **0**

### 4.3 Backend API Probe Summary (Railway API)

| ID | Endpoint | Status | Size | `Cache-Control` | Edge Cache Hit |
| :--- | :--- | :---: | ---: | :--- | :---: |
| `api_health` | `/health` | 200 | 104 B | none (default dynamic) | None (`railway-hikari`) |
| `api_hospitals` | `/api/hospitals` | 200 | 13,189 B | none / revalidate | None (`railway-hikari`) |
| `api_blood_banks` | `/api/blood-banks` | 200 | 3,753 B | none / revalidate | None (`railway-hikari`) |
| `api_ambulances` | `/api/ambulances` | 200 | 6,045 B | none / revalidate | None (`railway-hikari`) |
| `api_diagnostics` | `/api/diagnostics` | 200 | 14,200 B | none / revalidate | None (`railway-hikari`) |
| `api_jobs` | `/api/jobs` | 200 | 136,245 B | none / revalidate | None (`railway-hikari`) |
| `api_tracking_status`| `/api/tracking/:token`| 404 | 21 B | `no-store` | None (`railway-hikari`) |

All API responses are served directly from Railway's application container with no intermediate caching layer storing stale responses.

---

## 5. Architectural Implications & Recommendations

### 5.1 Dossier Correction (Section 3.1.4)
The current narrative in `10-caching-and-data-freshness-analysis.md` (and the manuscript draft) must be revised as follows:
- **Replace**: Claims that edge cache retention of 6.8 hours exposes patients to stale availability.
- **Insert**: Confirmation that empirical datapath auditing revealed **zero clinical availability data in edge-cached HTML shells**. The HTML documents function purely as inert Application Shells.
- **Clarify**: The true hazard that edge caching presents is limited to **shell availability during client hydration failure**: if a client device is disconnected from the network immediately after downloading the HTML shell, the client will see an empty directory or "Loading providers..." placeholder rather than stale data. This is an availability/usability degradation, not a silent misdirection hazard.

### 5.2 Architectural Safety Boundary
The decoupled architecture provides strong natural protection against caching bugs:
1. Static assets and HTML shells reside on Vercel CDN (`max-age=0, must-revalidate` on HTML, `immutable` on content-hashed static assets).
2. Dynamic data resides exclusively on Railway API + Atlas MongoDB.
3. Next.js App Router client components ensure that data fetching is initiated only after execution of JavaScript on the end-user device.

---

## 6. Artifact Index
- Complete audit summary: `/home/anonymous/medreach/research/results/datapath/datapath_audit_summary.json`
- Test probe script: `/home/anonymous/medreach/research/results/datapath/datapath_probe.mjs`
- Raw HTML captures: `/home/anonymous/medreach/research/results/datapath/captures/*.html`
- Raw header captures: `/home/anonymous/medreach/research/results/datapath/captures/*.headers.json`
