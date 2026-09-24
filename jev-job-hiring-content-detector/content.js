/**
 * Hiring Content Detector - Content Script
 * Scans DOM for hiring/employment-related content using keyword scoring and optional AI validation.
 * Optimized for LinkedIn (SDUI & Legacy), x.com (Twitter), Reddit, and general job boards.
 * Displays non-hiring posts as compact gray-colored boxes to preserve virtual scrolling.
 */

(() => {
  'use strict';

  // --- Keyword Dictionary & Pre-compiled Regex Patterns ---

  const PHRASE_GROUPS = {
    strong: [
      "we're hiring", "we are hiring", "were hiring", "is hiring", "hiring now", "now hiring",
      "currently hiring", "actively hiring", "open roles", "open role",
      "open position", "open positions", "positions open", "job opening", "job openings",
      "hiring for", "looking to hire", "seeking", "join our team", "join my team",
      "come work with us", "multiple openings", "immediate opening", "urgent hiring",
      "urgent requirement", "opening for", "applications open", "apply now", "apply today",
      "apply here", "apply at", "send your resume", "send your cv", "share your resume",
      "share your cv", "share cv", "send cv", "dm me your resume", "dm me your cv",
      "dm me", "dm for details", "reach out", "get in touch", "interested candidates",
      "looking for talent", "our team is growing", "we're growing", "were growing", "hiring alert",
      "we are looking for", "we're looking for", "were looking for", "looking for a", "looking for an",
      "hiring:", "role:", "job role", "job roles", "job profile", "job vacancy",
      "job vacancies", "referrals welcome", "immediate joiner", "immediate joiners",
      "calling all"
    ],
    notable: [
      "career opportunity", "career opportunities", "new opportunity",
      "exciting opportunity", "several positions available", "positions available",
      "looking for talented people", "seeking talented individuals", "experience:",
      "years of experience", "yrs of experience", "yrs exp", "salary:", "ctc:",
      "package:", "lpa", "stipend:", "stipend", "work from home", "wfh", "location: remote"
    ],
    possible: [
      "talent acquisition", "headcount", "open requisition", "recruiter",
      "recruiting", "recruitment", "staffing agency", "candidate pipeline",
      "candidate sourcing", "interview process", "job offer", "onboarding",
      "full-time", "part-time", "remote jobs", "remote job", "remote work",
      "internship", "internships", "intern", "freshers", "graduate jobs", "contractor",
      "freelance", "temporary placement", "talent partner", "esops"
    ],
    hashtags: [
      "hiring", "hiringnow", "werehiring", "activelyhiring", "recruiting",
      "recruitment", "talentacquisition", "techjobs", "remotejobs", "jobsearch",
      "opentowork", "jobopening", "careers", "career", "joinourteam",
      "workwithus", "nowhiring", "hiringalert", "jobs", "job", "internship",
      "datascienceintern", "startupjobs"
    ]
  };

  // Pre-compiled Single-Pass Regular Expressions (V8 Irregexp Optimized)
  const REGEX_PATTERNS = {
    strong: new RegExp(
      '\\b(?:we[\'’]?re hiring|we are hiring|were hiring|is hiring|hiring now|now hiring|currently hiring|actively hiring|' +
      'open roles?|open positions?|positions? open|job openings?|hiring for|looking to hire|seeking|join (?:our|my) team|' +
      'come work with us|multiple openings|immediate openings?|urgent hiring|urgent requirement|openings? for|' +
      'applications open|apply (?:now|today|here|at)|send your (?:resume|cv)|share your (?:resume|cv)|(?:share|send) cv|' +
      'dm me (?:your (?:resume|cv))?|dm for details|reach out|get in touch|interested candidates|looking for talent|' +
      'our team is growing|we[\'’]?re growing|were growing|hiring alert|we are looking for|we[\'’]?re looking for|' +
      'were looking for|looking for an?|hiring:|role:|job roles?|job profile|job vacanc(?:y|ies)|referrals welcome|' +
      'immediate joiners?|calling all)\\b',
      'gi'
    ),
    notable: new RegExp(
      '\\b(?:career opportunit(?:y|ies)|new opportunity|exciting opportunity|positions? available|' +
      'looking for talented (?:people|individuals)|seeking talented individuals|experience:|years? of experience|' +
      'yrs? of experience|yrs? exp|salary:|ctc:|package:|lpa|stipend:|stipend|work from home|wfh|location:\\s*remote)\\b',
      'gi'
    ),
    possible: new RegExp(
      '\\b(?:talent acquisition|headcount|open requisition|recruit(?:er|ing|ment)|staffing agency|' +
      'candidate pipeline|candidate sourcing|interview process|job offer|onboarding|full-time|part-time|' +
      'remote jobs?|remote work|internships?|interns?|freshers?|graduate jobs?|contractor|freelance|' +
      'temporary placement|talent partner|esops?)\\b',
      'gi'
    ),
    hashtags: new RegExp(
      '#(?:hiring|hiringnow|werehiring|activelyhiring|recruiting|recruitment|talentacquisition|techjobs|' +
      'remotejobs|jobsearch|opentowork|jobopening|careers?|joinourteam|workwithus|nowhiring|hiringalert|' +
      'jobs?|internships?|datascienceintern|startupjobs)\\b',
      'gi'
    ),
    negative: new RegExp(
      '\\b(?:layoffs?|firing|no longer hiring|position closed|positions closed|scams?|frauds?)\\b',
      'gi'
    )
  };

  const WEIGHTS = {
    strong:   30,
    notable:  15,
    possible: 10,
    hashtag:  15
  };

  const THRESHOLDS = {
    strong:   40,
    notable:  20,
    possible: 10,
    none:      0
  };

  // --- Runtime State ---

  let config = {
    active: true,
    highlight: true,
    filter: false,
    dim: false,
    jev: false
  };

  let scanDebounceTimer = null;
  let observer = null;
  let isPageHydrated = false;
  const scoredPosts = new WeakMap();

  // --- Platform-Aware Post Card Resolvers (LinkedIn SDUI + Legacy + x.com) ---

  /**
   * Resolves the outermost post card container for any supported platform.
   * Excludes generic layout columns (main, body, section) to prevent React breaking.
   */
  function getPostContainer(el) {
    if (!el || el === document.body || el === document.documentElement) return null;

    // 1. LinkedIn SDUI Post Card (2024-2026 flagship feed)
    // Primary identifier: componentkey containing "update-card-focus" or "update-card"
    const liSduiCard = el.closest?.('div[componentkey*="update-card-focus"]') ||
                       el.closest?.('div[role="listitem"][componentkey*="update-card"]');
    if (liSduiCard) return liSduiCard;

    // Check if inside LinkedIn feed lazy item (excluding sharebox & sort bar)
    const liLazyItem = el.closest?.('[data-testid="mainFeed"] [data-lazy-mount-id] div[role="listitem"]') ||
                       el.closest?.('[data-component-type="LazyColumn"] [data-lazy-mount-id] div[role="listitem"]');
    if (liLazyItem) {
      if (liLazyItem.querySelector('[data-testid="expandable-text-box"]') ||
          liLazyItem.querySelector('h2') ||
          liLazyItem.getAttribute('componentkey')?.includes('update-card')) {
        return liLazyItem;
      }
    }

    // 2. Legacy LinkedIn feed cards
    const liLegacyCard = el.closest?.('div.feed-shared-update-v2') ||
                         el.closest?.('div.occludable-update') ||
                         el.closest?.('div[data-urn*="urn:li:activity"]');
    if (liLegacyCard) return liLegacyCard;

    // 3. x.com tweet card
    const tweet = el.closest?.('article[data-testid="tweet"]');
    if (tweet) return tweet;

    // 4. Reddit post
    const reddit = el.closest?.('shreddit-post, div[data-testid="post-container"], div.Post');
    if (reddit) return reddit;

    // 5. Hacker News item
    const hn = el.closest?.('tr.athing');
    if (hn) return hn;

    // 6. Generic article (strictly post-level, excluding root layouts)
    const generic = el.closest?.('article, [role="article"]');
    if (generic && generic !== document.body && generic !== document.documentElement && generic.tagName !== 'MAIN') {
      return generic;
    }

    return null;
  }

  /**
   * Retrieves all discrete post cards on the page.
   */
  function getAllPagePosts() {
    const posts = new Set();

    // 1. LinkedIn SDUI feed posts (matching live feed DOM: div[componentkey*="update-card-focus"])
    const sduiCards = document.querySelectorAll(
      'div[componentkey*="update-card-focus"], div[role="listitem"][componentkey*="update-card-focus"], div[componentkey*="update-card-"]'
    );
    if (sduiCards.length > 0) {
      sduiCards.forEach(p => posts.add(p));
      return Array.from(posts);
    }

    // Fallback for LinkedIn LazyColumn items
    const feedListItems = document.querySelectorAll(
      '[data-testid="mainFeed"] [data-lazy-mount-id] div[role="listitem"], [data-component-type="LazyColumn"] [data-lazy-mount-id] div[role="listitem"]'
    );
    if (feedListItems.length > 0) {
      feedListItems.forEach(item => {
        // Exclude sharebox / sort dropdown by ensuring it contains post content or feed header
        if (item.querySelector('[data-testid="expandable-text-box"]') ||
            item.getAttribute('componentkey')?.includes('update-card') ||
            item.querySelector('h2') ||
            (item.innerText && item.innerText.length > 45)) {
          const card = item.closest('[componentkey*="update-card"]') ||
                       item.querySelector('[componentkey*="update-card"]') ||
                       item;
          posts.add(card);
        }
      });
      if (posts.size > 0) return Array.from(posts);
    }

    // 2. Legacy LinkedIn posts
    const liUpdates = document.querySelectorAll(
      'div.feed-shared-update-v2, div[data-urn*="urn:li:activity"], div.occludable-update, div[data-view-name="feed-full-update"]'
    );
    if (liUpdates.length > 0) {
      liUpdates.forEach(p => {
        const topCard = p.closest('div.occludable-update') || p.closest('div.feed-shared-update-v2') || p;
        if (topCard) posts.add(topCard);
      });
      return Array.from(posts);
    }

    // 3. x.com tweets
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');
    if (tweets.length > 0) {
      return Array.from(tweets);
    }

    // 4. Reddit posts
    const redditPosts = document.querySelectorAll('shreddit-post, div[data-testid="post-container"], div.Post');
    if (redditPosts.length > 0) {
      return Array.from(redditPosts);
    }

    // 5. Generic articles (strictly post-level, excluding main / body)
    document.querySelectorAll('article, [role="article"]').forEach(a => {
      if (a !== document.body && a !== document.documentElement && a.tagName !== 'MAIN') {
        posts.add(a);
      }
    });

    return Array.from(posts);
  }

  // --- Text Extraction & Scoring ---

  function getPostText(post) {
    if (!post) return '';
    if (post._hcRawText) return post._hcRawText;

    // Prefer expandable text box if available for LinkedIn SDUI
    const expandableBox = post.querySelector?.('[data-testid="expandable-text-box"]');
    let text = expandableBox ? (expandableBox.innerText || expandableBox.textContent || '') : '';
    const fullText = (post.innerText || post.textContent || '');

    if (text && !fullText.includes(text)) {
      text = text + ' ' + fullText;
    } else {
      text = fullText || text;
    }

    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 5) {
      post._hcRawText = cleaned;
    }
    return cleaned;
  }

  function scoreText(text) {
    if (!text || text.length < 5) return 0;

    let score = 0;
    const words = text.split(/\s+/).length;

    // Single-pass regex scans using pre-compiled V8 Irregexp bytecode
    const strongMatches = text.match(REGEX_PATTERNS.strong);
    if (strongMatches) score += strongMatches.length * WEIGHTS.strong;

    const notableMatches = text.match(REGEX_PATTERNS.notable);
    if (notableMatches) score += notableMatches.length * WEIGHTS.notable;

    const possibleMatches = text.match(REGEX_PATTERNS.possible);
    if (possibleMatches) score += possibleMatches.length * WEIGHTS.possible;

    const hashMatches = text.match(REGEX_PATTERNS.hashtags);
    if (hashMatches) score += hashMatches.length * WEIGHTS.hashtag;

    // Short text bonus (concise posts and tweets)
    if (words <= 25 && score > 0) score += Math.max(0, 15 - words);

    // Negative/Disqualification penalty
    const negMatches = text.match(REGEX_PATTERNS.negative);
    if (negMatches) score -= negMatches.length * 15;

    return Math.min(Math.max(0, score), 150);
  }

  function getTier(score) {
    if (score >= THRESHOLDS.strong) return 'strong';
    if (score >= THRESHOLDS.notable) return 'notable';
    if (score >= THRESHOLDS.possible) return 'possible';
    return 'none';
  }

  // --- Dynamic Style Injection ---

  function injectStyles() {
    if (document.getElementById('hc-style-sheet')) return;
    const style = document.createElement('style');
    style.id = 'hc-style-sheet';
    style.textContent = `
      /* Hiring Post Highlight: Glowing Teal Card Border */
      .hc-highlight-card {
        outline: 2px solid rgba(0, 135, 108, 0.9) !important;
        box-shadow: 0 0 16px rgba(0, 135, 108, 0.25) !important;
        border-radius: 8px !important;
        transition: outline 0.2s ease, box-shadow 0.2s ease !important;
      }

      /* Compact/Overlay Gray Box for Filtered Non-Hiring Posts (preserves virtual scroll metrics) */
      .hc-filter-greyed {
        position: relative !important;
        /* DO NOT change height or display to prevent React virtual scroller infinite loops */
        border: 1px solid #323b4b !important;
        border-radius: 8px !important;
        margin-top: 4px !important;
        margin-bottom: 8px !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
        transition: all 0.2s ease !important;
      }

      /* Solid overlay to hide the content without affecting layout dimensions */
      .hc-filter-greyed::before {
        content: "" !important;
        position: absolute !important;
        top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        background-color: #1e232d !important;
        z-index: 99 !important;
        border-radius: 8px !important;
      }

      /* Make children non-interactive and practically invisible when filtered */
      .hc-filter-greyed > * {
        pointer-events: none !important;
        user-select: none !important;
        opacity: 0.01 !important; /* Low opacity keeps intersection observers active */
      }

      /* The overlay label */
      .hc-filter-greyed::after {
        content: "📁 Non-hiring post (filtered) · Click to expand" !important;
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        color: #94a3b8 !important;
        letter-spacing: 0.2px !important;
        pointer-events: none !important;
        z-index: 100 !important;
        background: #1e232d !important;
        padding: 8px 16px !important;
        border-radius: 4px !important;
        border: 1px solid #323b4b !important;
        white-space: nowrap !important;
      }

      .hc-filter-greyed:hover::before {
        background-color: #272e3b !important;
      }
      .hc-filter-greyed:hover::after {
        background-color: #272e3b !important;
      }

      /* Expanded Gray Box on Click */
      .hc-filter-greyed.hc-expanded::before,
      .hc-filter-greyed.hc-expanded::after {
        display: none !important;
      }

      .hc-filter-greyed.hc-expanded > * {
        pointer-events: auto !important;
        user-select: auto !important;
        opacity: 1 !important;
      }
      
      .hc-filter-greyed.hc-expanded {
        border-color: #475569 !important;
        background-color: inherit !important;
      }

      /* Dimmed Posts */
      .hc-blocked {
        opacity: 0.18 !important;
        filter: grayscale(85%) blur(0.5px) !important;
        transition: opacity 0.25s ease, filter 0.25s ease !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // --- Click to Expand Filtered Gray Box ---

  document.addEventListener('click', e => {
    const greyedCard = e.target.closest?.('.hc-filter-greyed');
    if (!greyedCard) return;

    // If already expanded, do not collapse when user interacts with links/buttons inside
    if (greyedCard.classList.contains('hc-expanded')) {
      if (e.target === greyedCard) {
        greyedCard.classList.remove('hc-expanded');
      }
    } else {
      // Collapsed: expand to show content
      greyedCard.classList.add('hc-expanded');
    }
  });

  // --- Evaluation & Gating Pipeline (Tiered: Regex Fast Path + JEV Offline Fallback) ---

  async function evaluatePost(post) {
    if (!post || post.hasAttribute('data-hc-checked')) return;

    const text = getPostText(post);
    
    // If text is too short, it might be a React skeleton or still hydrating.
    // Abort and do NOT set data-hc-checked so it gets picked up on the next DOM mutation.
    if (text.length < 15) {
      return;
    }

    post.setAttribute('data-hc-checked', 'evaluating');

    // Tier 1: Instant local Regex scoring (always offline-first, < 0.2ms)
    const localScore = scoreText(text);
    let passes = localScore >= THRESHOLDS.possible;

    // Tier 2: Optional JEV AI Deep Validation (with automatic offline fallback)
    if (config.jev && passes && text.length > 10) {
      try {
        const jevResult = await requestJevScore(text.slice(0, 400));
        if (jevResult && typeof jevResult.score === 'number' && !jevResult.error) {
          passes = jevResult.score >= 0.45;
        } else {
          // If JEV API is offline, rate-limited, or returns an error, gracefully preserve Tier 1 Regex decision
          console.debug('[HiringDetector] JEV offline or unreachable — cleanly falling back to local Regex score:', localScore);
        }
      } catch (err) {
        console.warn('[HiringDetector] JEV offline fallback to local regex:', err);
      }
    }

    scoredPosts.set(post, { score: localScore, tier: getTier(localScore), passes });

    if (passes) {
      post.setAttribute('data-hc-checked', 'passed');
      post.classList.remove('hc-filter-greyed', 'hc-blocked');
      if (config.highlight) {
        post.classList.add('hc-highlight-card');
      } else {
        post.classList.remove('hc-highlight-card');
      }
    } else {
      post.setAttribute('data-hc-checked', 'rejected');
      post.classList.remove('hc-highlight-card');

      if (config.filter) {
        post.classList.add('hc-filter-greyed');
      } else {
        post.classList.remove('hc-filter-greyed');
      }

      if (config.dim) {
        post.classList.add('hc-blocked');
      } else {
        post.classList.remove('hc-blocked');
      }
    }
  }

  function requestJevScore(text) {
    return new Promise(resolve => {
      safeSendMessage({ type: 'JEV_SCORE', text }, resp => {
        resolve(resp || null);
      });
    });
  }

  // --- Scan & Visual Orchestration ---

  async function scanAllPosts() {
    if (!config.active) return;
    injectStyles();

    const posts = getAllPagePosts();
    let strong = 0;
    let notable = 0;
    let possible = 0;

    for (const post of posts) {
      if (!post.hasAttribute('data-hc-checked')) {
        await evaluatePost(post);
      }
      const data = scoredPosts.get(post);
      if (data?.passes) {
        if (data.tier === 'strong') strong++;
        else if (data.tier === 'notable') notable++;
        else possible++;
      }
    }

    const total = strong + notable + possible;
    const stats = { strong, notable, possible, total, scannedElements: posts.length };

    safeSendMessage({
      type: 'SCAN_COMPLETE',
      stats
    });

    return stats;
  }

  function updateVisuals() {
    if (!config.active) {
      cleanUpVisuals();
      return;
    }

    injectStyles();

    const posts = getAllPagePosts();
    for (const post of posts) {
      const data = scoredPosts.get(post);
      const passes = data ? data.passes : false;

      // Highlight
      if (config.highlight && passes) {
        post.classList.add('hc-highlight-card');
      } else {
        post.classList.remove('hc-highlight-card');
      }

      // Filter (Compact Gray Box)
      if (config.filter && !passes) {
        post.classList.add('hc-filter-greyed');
      } else {
        post.classList.remove('hc-filter-greyed');
      }

      // Dim (Fade out)
      if (config.dim && !passes) {
        post.classList.add('hc-blocked');
      } else {
        post.classList.remove('hc-blocked');
      }
    }
  }

  function cleanUpVisuals() {
    document.querySelectorAll('.hc-highlight-card').forEach(el => el.classList.remove('hc-highlight-card'));
    document.querySelectorAll('.hc-filter-greyed').forEach(el => el.classList.remove('hc-filter-greyed', 'hc-expanded'));
    document.querySelectorAll('.hc-blocked').forEach(el => el.classList.remove('hc-blocked'));
    document.querySelectorAll('[data-hc-checked]').forEach(el => el.removeAttribute('data-hc-checked'));
  }

  function cleanUp() {
    cleanUpVisuals();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // --- Stable Mutation Observer ---

  function startObserver() {
    if (observer || !config.active) return;

    observer = new MutationObserver(mutations => {
      let hasNewPosts = false;

      for (const m of mutations) {
        if (m.type === 'attributes') continue;

        for (const node of m.addedNodes) {
          const element = node.nodeType === 1 ? node : (node.nodeType === 3 ? node.parentElement : null);
          if (!element) continue;
          if (element.id === 'hc-style-sheet') continue;

          // Is the added node a post itself?
          if (element.matches?.('article[data-testid="tweet"], [componentkey*="update-card"], [data-lazy-mount-id], div.feed-shared-update-v2, div.occludable-update')) {
            element.removeAttribute('data-hc-checked');
            delete element._hcRawText;
            hasNewPosts = true;
          } else {
            // Is the added node INSIDE an existing post?
            const parentPost = element.closest?.('article[data-testid="tweet"], [componentkey*="update-card"], [data-lazy-mount-id], div.feed-shared-update-v2, div.occludable-update');
            if (parentPost) {
              const oldText = parentPost._hcRawText || "";
              const cachedText = parentPost._hcRawText;
              
              // Force fresh text extraction
              delete parentPost._hcRawText;
              const newText = getPostText(parentPost);

              if (oldText !== newText) {
                // Text changed (e.g. hydration completed)! Re-evaluate.
                parentPost.removeAttribute('data-hc-checked');
                hasNewPosts = true;
              } else {
                // False alarm (e.g. image loaded, but text didn't change)
                parentPost._hcRawText = cachedText;
              }
            }
          }
        }
        if (hasNewPosts) break;
      }

      if (hasNewPosts) {
        clearTimeout(scanDebounceTimer);
        scanDebounceTimer = setTimeout(() => {
          if (config.active) {
            scanAllPosts();
          }
        }, 400);
      }
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }

  function safeSendMessage(msg, callback) {
    try {
      if (!chrome.runtime?.id) return;
      chrome.runtime.sendMessage(msg, resp => {
        if (chrome.runtime.lastError) return;
        if (callback) callback(resp);
      });
    } catch {
      // Context invalidated during extension reload
    }
  }

  function getStatsSummary() {
    let strong = 0, notable = 0, possible = 0;
    const posts = getAllPagePosts();
    for (const post of posts) {
      const data = scoredPosts.get(post);
      if (data?.passes) {
        if (data.tier === 'strong') strong++;
        else if (data.tier === 'notable') notable++;
        else possible++;
      }
    }
    return { strong, notable, possible, total: strong + notable + possible, scannedElements: posts.length };
  }

  // --- Public API ---

  window.HiringDetector = {
    scan: scanAllPosts,
    clear: cleanUp,
    setConfig: newConfig => {
      config = { ...config, ...newConfig };
      if (!config.active) {
        cleanUpVisuals();
      } else {
        updateVisuals();
        scanAllPosts();
        startObserver();
      }
      return { config, stats: getStatsSummary() };
    },
    getState: () => ({ config, stats: getStatsSummary() })
  };

  // --- Runtime Message Listener ---

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'SET_CONFIG':
        const state = window.HiringDetector.setConfig(msg.config || {});
        sendResponse({ ok: true, state });
        break;

      case 'GET_STATE':
        sendResponse({ ok: true, state: window.HiringDetector.getState() });
        break;

      case 'TRIGGER_RESCAN':
        cleanUpVisuals();
        scanAllPosts().then(stats => {
          sendResponse({ ok: true, state: { config, stats } });
        });
        return true;

      case 'CLEAR_MARKS':
        cleanUpVisuals();
        sendResponse({ ok: true, state: window.HiringDetector.getState() });
        break;

      case 'RUN_SCAN':
        scanAllPosts().then(stats => {
          sendResponse({ ok: true, state: { config, stats } });
        });
        return true;

      case 'PING':
        sendResponse({ ok: true, active: config.active });
        break;
    }
    return true;
  });

  // Hydration-Safe Initialization: Watches for LinkedIn's data-rehydrated="true" or React completion
  chrome.storage.local.get(['detectorActive', 'highlightMatches', 'filterNonHiring', 'dimNonHiring', 'jevEnabled'], data => {
    config = {
      active: data.detectorActive !== undefined ? !!data.detectorActive : true,
      highlight: data.highlightMatches !== undefined ? !!data.highlightMatches : true,
      filter: !!data.filterNonHiring,
      dim: !!data.dimNonHiring,
      jev: !!data.jevEnabled
    };

    if (config.active) {
      const scheduleSafeInit = () => {
        if (isPageHydrated) return;

        const startInit = () => {
          if (isPageHydrated) return;
          isPageHydrated = true;
          injectStyles();
          scanAllPosts();
          startObserver();
        };

        // Check if LinkedIn has finished rehydration
        if (document.body?.getAttribute('data-rehydrated') === 'true') {
          setTimeout(startInit, 400);
          return;
        }

        // Observe when data-rehydrated="true" is added to body
        const rehydrateObs = new MutationObserver(() => {
          if (document.body?.getAttribute('data-rehydrated') === 'true') {
            rehydrateObs.disconnect();
            setTimeout(startInit, 400);
          }
        });

        if (document.body) {
          rehydrateObs.observe(document.body, { attributes: true, attributeFilter: ['data-rehydrated'] });
        }

        // Fallback for non-LinkedIn sites
        window.addEventListener('load', () => setTimeout(startInit, 1000), { once: true });
        if (document.readyState === 'complete') {
          setTimeout(startInit, 1200);
        }
      };

      if (document.body) {
        scheduleSafeInit();
      } else {
        document.addEventListener('DOMContentLoaded', scheduleSafeInit, { once: true });
      }
    }
  });

})();
