/**
 * Hiring Content Detector - Background Service Worker
 * Handles privileged operations: script injection, API relaying, storage management.
 */

try {
  importScripts('encrypt.js');
} catch (e) {
  console.warn('[background] importScripts failed:', e);
}

const JEV_RATE_LIMIT_MS = 800;
let lastJevCall = 0;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['detectorActive', 'highlightMatches', 'filterNonHiring', 'dimNonHiring', 'jevEnabled'], data => {
    const defaults = {};
    if (data.detectorActive === undefined) defaults.detectorActive = true;
    if (data.highlightMatches === undefined) defaults.highlightMatches = true;
    if (data.filterNonHiring === undefined) defaults.filterNonHiring = false;
    if (data.dimNonHiring === undefined) defaults.dimNonHiring = false;
    if (data.jevEnabled === undefined) defaults.jevEnabled = false;
    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender
  const isExtension = sender.id === chrome.runtime.id;
  if (!isExtension && sender.id) {
    const extCfg = chrome.runtime.getManifest().externally_connectable;
    if (extCfg?.ids?.length > 0 && !extCfg.ids.includes(sender.id)) {
      console.warn('[background] Unauthorized sender:', sender.id);
      return true;
    }
  }

  // Active Tab query helper
  if (message.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs?.[0];
      const tabId = tab?.id > 0 ? tab.id : -1;
      const url = tab?.url || '';
      sendResponse({ tabId, url });
    });
    return true;
  }

  // Robust tab communication with auto-inject fallback
  if (message.type === 'SEND_TO_TAB') {
    sendToTabWithFallback(message.tabId, message.msg, sendResponse);
    return true;
  }

  // Poll results from tab
  if (message.type === 'POLL_RESULTS') {
    pollResults(message.tabId, sendResponse);
    return true;
  }

  // Scan completion notification from content script
  if (message.type === 'SCAN_COMPLETE') {
    chrome.storage.local.set({ scanStats: message.stats });
    sendResponse({ ok: true });
    return true;
  }

  // JEV scoring API handler
  if (message.type === 'JEV_SCORE') {
    handleJevScore(message, sendResponse);
    return true;
  }

  if (message.type === 'PING') {
    sendResponse({ ok: true });
    return true;
  }
});

async function sendToTabWithFallback(tabId, msg, sendResponse) {
  if (!tabId || tabId <= 0) {
    sendResponse({ error: 'Invalid tab ID' });
    return;
  }

  try {
    // Attempt standard message
    chrome.tabs.sendMessage(tabId, msg, response => {
      if (chrome.runtime.lastError) {
        // Tab might not have content script injected yet (e.g. freshly created tab)
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['encrypt.js', 'content.js']
        }).then(() => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, msg, retryResp => {
              sendResponse(retryResp || { ok: true });
            });
          }, 100);
        }).catch(err => {
          sendResponse({ error: err.message });
        });
      } else {
        sendResponse(response || { ok: true });
      }
    });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function pollResults(tabId, sendResponse) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.HiringDetector?.getLastResults() || {}
    });
    sendResponse(result?.[0]?.result || result?.[0] || {});
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleJevScore(message, sendResponse) {
  let { text, apiKey } = message;

  if (!text) {
    sendResponse({ error: 'Missing text' });
    return;
  }

  // If no apiKey passed in message, read and decrypt from local storage
  if (!apiKey) {
    try {
      const raw = await chrome.storage.local.get('apiKey');
      if (raw.apiKey) {
        if (self.HCEncrypt) {
          apiKey = await self.HCEncrypt.decrypt(raw.apiKey);
        } else {
          apiKey = raw.apiKey;
        }
      }
    } catch (e) {
      console.warn('[background] Key decryption failed:', e);
    }
  }

  if (!apiKey) {
    sendResponse({ error: 'No API key configured' });
    return;
  }

  if (Date.now() - lastJevCall < JEV_RATE_LIMIT_MS) {
    await sleep(JEV_RATE_LIMIT_MS - (Date.now() - lastJevCall));
  }

  try {
    const resp = await fetch('https://api.jev.ai/v1/score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ text })
    });

    if (!resp.ok) throw new Error(`JEV API status: ${resp.status}`);

    const data = await resp.json();
    lastJevCall = Date.now();

    sendResponse({
      success: true,
      score: normalizeScore(data.score),
      confidence: data.confidence ?? null
    });
  } catch (err) {
    console.warn('[background] JEV scoring error:', err.message);
    sendResponse({ success: false, error: err.message, score: null });
  }
}

function normalizeScore(raw) {
  if (typeof raw === 'number') {
    if (raw > 1) return raw / 100;
    if (raw >= 0 && raw <= 1) return raw;
  }
  return 0.5;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
