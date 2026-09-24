# Product Specification: JEV - Job Hiring Content Detector

## 1. Overview
The JEV - Job Hiring Content Detector is a Manifest V3 Chrome Extension engineered to detect, score, outline, and isolate hiring and employment posts across social networks and job boards (e.g. LinkedIn, X/Twitter, Hacker News, Reddit).

## 2. Core Functional Components
- **Background Service Worker (`background.js`)**: Manages secure message dispatching, tab identification, script fallback injection, and rate-limited communication with the JEV AI validation API (`https://api.jev.ai/v1/score`).
- **Content Engine (`content.js`)**: Runs directly on web pages with a pre-compiled V8 Irregexp single-pass scoring engine (`REGEX_PATTERNS`), SDUI card targeting, heading bonuses, negative word filters, mutation observers, and dynamic DOM visual overlays.
- **Tiered Hybrid Architecture**: Tier 1 client-side regex scoring runs in < 0.003ms with zero network requirements; Tier 2 JEV AI arbitration validates borderline items with automated offline fallback to local regex scores.
- **Security & Encryption (`encrypt.js`)**: AES-256-GCM encryption of sensitive user API keys in local Chrome storage using native Chromium WebCrypto API and PBKDF2 key derivation.
- **Control Interface (`popup.html` / `popup.js` / `popup.css`)**: Dark-mode toggle menu with live telemetry chips and slide-out settings drawer.

## 3. UI/UX Specification
- **Master Toggle (`detectorActive`)**: Global enable/pause switch with status pulse indicator.
- **Feature Toggles**:
  - `Highlight Matches`: Renders glowing Deep Teal (`#00876c`) card borders and badge counters.
  - `Filter Non-Hiring`: Collapses non-hiring items into compact 48px gray-colored boxes (`.hc-filter-greyed`) with click-to-expand to prevent breaking virtual feeds.
  - `Dim Background`: Dims non-job items with opacity and grayscale filters.
  - `AI Verification (JEV)`: Evaluates borderline content with JEV AI API.
- **Telemetry Chips**: Live metrics for Total, Strong, Notable, and Possible matches.
- **Drawer Panel (`⚙️`)**: Conceals API credentials, export JSON, and historical scans.
