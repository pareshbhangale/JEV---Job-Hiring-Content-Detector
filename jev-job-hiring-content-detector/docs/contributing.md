# Contributing to Hiring Content Detector

Thank you for your interest in contributing! This project is an open-source, privacy-first Chrome Extension designed to help job seekers find hiring posts with zero latency.

---

## 💻 Development Workflow

### Prerequisites
- Modern Chromium-based browser (Chrome, Brave, Edge).
- Node.js (v18+) for running local benchmark and regex tests.

### Local Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/jev-job-hiring-content-detector.git
   cd jev-job-hiring-content-detector/apps/jev-job-hiring-content-detector
   ```
2. In Chrome, visit `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extension directory.
4. After modifying any file (`content.js`, `background.js`, `popup.js`):
   - Click the reload icon `↻` on the extension card in `chrome://extensions`.
   - Refresh any open test tabs (e.g. LinkedIn or X.com) to load the new content script.

---

## 📐 Coding Standards

- **Vanilla JavaScript (ES6+)**: Do not introduce heavy frontend frameworks or build steps. Keep the codebase lightweight, native, and fast.
- **Pre-Compiled Regular Expressions**: Add new hiring phrases directly to `REGEX_PATTERNS` in `content.js` to preserve the single-pass V8 execution speed. Always use word boundaries (`\b`) to prevent false positives.
- **Virtual Scroller Safety**: Never set `display: none` or forcefully change the pixel heights of post containers on infinite-scroll feeds (like X.com or LinkedIn), as this causes virtual scrollers to enter render loops. Use overlay pseudo-elements (`::before`) instead.
- **Privacy & Security**: Never add external analytics, third-party CDNs, or trackers. All cryptographic operations must use native WebCrypto (`crypto.subtle`).

---

## 🧪 Testing Checklist Before Pull Request

- [ ] Extension loads without warnings or errors in `chrome://extensions`.
- [ ] Scanning works on LinkedIn (both modern SDUI and legacy cards).
- [ ] Scanning works on X.com without causing page refreshes or virtual scrolling loops.
- [ ] Gray box preview expands and collapses cleanly on click without navigating away.
- [ ] No personal keys or temporary test files are committed.
- [ ] Documentation and `docs/changelog.md` are updated with version details.

---

## 📄 License
By contributing to this repository, you agree that your contributions will be licensed under the project's [MIT License](../LICENSE).
