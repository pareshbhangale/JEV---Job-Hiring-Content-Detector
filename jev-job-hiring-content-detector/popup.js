/**
 * Hiring Content Detector - Modern Toggle Menu Popup Script
 */

(() => {
  'use strict';

  // --- DOM References ---

  const domainBadge = document.getElementById('domainBadge');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsDrawer = document.getElementById('settingsDrawer');

  const masterCard = document.getElementById('masterCard');
  const masterToggle = document.getElementById('masterToggle');
  const masterStatusLabel = document.getElementById('masterStatusLabel');
  const masterStatusSub = document.getElementById('masterStatusSub');
  const mainControls = document.getElementById('mainControls');

  const statTotal = document.getElementById('statTotal');
  const statStrong = document.getElementById('statStrong');
  const statNotable = document.getElementById('statNotable');
  const statPossible = document.getElementById('statPossible');

  const toggleHighlight = document.getElementById('toggleHighlight');
  const toggleFilter = document.getElementById('toggleFilter');
  const toggleDim = document.getElementById('toggleDim');
  const toggleJev = document.getElementById('toggleJev');

  const rescanBtn = document.getElementById('rescanBtn');
  const rescanIcon = document.getElementById('rescanIcon');
  const clearBtn = document.getElementById('clearBtn');

  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleKeyVisBtn = document.getElementById('toggleKeyVisBtn');
  const keyStatusMsg = document.getElementById('keyStatusMsg');
  const historyList = document.getElementById('historyList');
  const exportBtn = document.getElementById('exportBtn');

  let activeTabId = -1;
  let keyDebounceTimer = null;

  // --- Initialization ---

  init().catch(err => console.error('[popup] Initialization error:', err));

  async function init() {
    await resolveActiveTab();
    await restoreSettings();
    await syncWithContentScript();
    setupEventListeners();
  }

  // --- Tab & State Resolution ---

  async function resolveActiveTab() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB' }, resp => {
        if (resp && resp.tabId > 0) {
          activeTabId = resp.tabId;
          try {
            const urlObj = new URL(resp.url);
            domainBadge.textContent = urlObj.hostname.replace(/^www\./, '');
          } catch {
            domainBadge.textContent = 'Active Page';
          }
        } else {
          domainBadge.textContent = 'No Webpage';
        }
        resolve();
      });
    });
  }

  async function restoreSettings() {
    // Restore toggle states
    chrome.storage.local.get(
      ['detectorActive', 'highlightMatches', 'filterNonHiring', 'dimNonHiring', 'jevEnabled', 'scanStats', 'history'],
      data => {
        const isActive = data.detectorActive !== undefined ? !!data.detectorActive : true;
        masterToggle.checked = isActive;
        updateMasterUI(isActive);

        toggleHighlight.checked = data.highlightMatches !== undefined ? !!data.highlightMatches : true;
        toggleFilter.checked = !!data.filterNonHiring;
        toggleDim.checked = !!data.dimNonHiring;
        toggleJev.checked = !!data.jevEnabled;

        if (data.scanStats) {
          updateStats(data.scanStats);
        }
        if (data.history) {
          renderHistory(data.history);
        }
      }
    );

    // Restore API key status indication
    const raw = await chrome.storage.local.get('apiKey');
    if (raw.apiKey) {
      keyStatusMsg.textContent = '✓ Saved securely in storage';
      keyStatusMsg.style.color = '#2ea043';
    }
  }

  async function syncWithContentScript() {
    if (activeTabId <= 0) return;

    sendToActiveTab({ type: 'GET_STATE' }, resp => {
      if (resp?.state?.stats) {
        updateStats(resp.state.stats);
      }
      if (resp?.state?.config) {
        const c = resp.state.config;
        if (c.active !== undefined) {
          masterToggle.checked = c.active;
          updateMasterUI(c.active);
        }
        if (c.highlight !== undefined) toggleHighlight.checked = c.highlight;
        if (c.filter !== undefined) toggleFilter.checked = c.filter;
        if (c.dim !== undefined) toggleDim.checked = c.dim;
        if (c.jev !== undefined) toggleJev.checked = c.jev;
      }
    });
  }

  // --- UI Update Helpers ---

  function updateMasterUI(isActive) {
    masterCard.classList.toggle('active', isActive);
    mainControls.classList.toggle('disabled', !isActive);

    if (isActive) {
      masterStatusLabel.textContent = 'Detector Active';
      masterStatusSub.textContent = 'Analyzing page feed';
    } else {
      masterStatusLabel.textContent = 'Detector Paused';
      masterStatusSub.textContent = 'Extension disabled on page';
    }
  }

  function updateStats(stats) {
    if (!stats) return;
    const s = stats.strong || 0;
    const n = stats.notable || 0;
    const p = stats.possible || 0;
    const tot = stats.total !== undefined ? stats.total : (s + n + p);

    statTotal.textContent = String(tot);
    statStrong.textContent = String(s);
    statNotable.textContent = String(n);
    statPossible.textContent = String(p);
  }

  function renderHistory(history) {
    if (!history || history.length === 0) {
      historyList.innerHTML = '<div class="empty-history">No scan records yet.</div>';
      return;
    }

    historyList.innerHTML = '';
    history.slice(-5).reverse().forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'history-time';
      timeSpan.textContent = entry.time || 'Recent';

      const countSpan = document.createElement('span');
      countSpan.className = 'history-count';
      countSpan.textContent = `${entry.count} matches`;

      item.appendChild(timeSpan);
      item.appendChild(countSpan);
      historyList.appendChild(item);
    });
  }

  // --- Configuration Dispatcher ---

  function dispatchConfig() {
    const currentConfig = {
      active: masterToggle.checked,
      highlight: toggleHighlight.checked,
      filter: toggleFilter.checked,
      dim: toggleDim.checked,
      jev: toggleJev.checked
    };

    // Save to local storage
    chrome.storage.local.set({
      detectorActive: currentConfig.active,
      highlightMatches: currentConfig.highlight,
      filterNonHiring: currentConfig.filter,
      dimNonHiring: currentConfig.dim,
      jevEnabled: currentConfig.jev
    });

    // Send immediately to content script
    if (activeTabId > 0) {
      sendToActiveTab({ type: 'SET_CONFIG', config: currentConfig }, resp => {
        if (resp?.state?.stats) {
          updateStats(resp.state.stats);
        }
      });
    }
  }

  function sendToActiveTab(msg, callback) {
    if (activeTabId <= 0) return;
    chrome.runtime.sendMessage({
      type: 'SEND_TO_TAB',
      tabId: activeTabId,
      msg
    }, resp => {
      if (callback) callback(resp);
    });
  }

  // --- Event Listeners ---

  function setupEventListeners() {
    // Master Switch
    masterToggle.addEventListener('change', () => {
      const isActive = masterToggle.checked;
      updateMasterUI(isActive);
      dispatchConfig();
    });

    // Sub Toggles
    [toggleHighlight, toggleFilter, toggleDim, toggleJev].forEach(toggle => {
      toggle.addEventListener('change', () => {
        dispatchConfig();
      });
    });

    // Rescan Action
    rescanBtn.addEventListener('click', () => {
      if (activeTabId <= 0) return;
      rescanIcon.classList.add('spinning');
      rescanBtn.disabled = true;

      sendToActiveTab({ type: 'TRIGGER_RESCAN' }, resp => {
        setTimeout(() => {
          rescanIcon.classList.remove('spinning');
          rescanBtn.disabled = false;
          if (resp?.state?.stats) {
            updateStats(resp.state.stats);
            saveHistoryEntry(resp.state.stats);
          }
        }, 400);
      });
    });

    // Clear Marks Action
    clearBtn.addEventListener('click', () => {
      if (activeTabId <= 0) return;
      sendToActiveTab({ type: 'CLEAR_MARKS' }, resp => {
        updateStats({ strong: 0, notable: 0, possible: 0, total: 0 });
      });
    });

    // Settings Drawer Open / Close
    openSettingsBtn.addEventListener('click', () => {
      settingsDrawer.classList.add('open');
    });

    closeSettingsBtn.addEventListener('click', () => {
      settingsDrawer.classList.remove('open');
    });

    // API Key Visibility
    toggleKeyVisBtn.addEventListener('click', () => {
      const isPass = apiKeyInput.type === 'password';
      apiKeyInput.type = isPass ? 'text' : 'password';
      toggleKeyVisBtn.textContent = isPass ? '🙈' : '👁';
    });

    // API Key Input
    apiKeyInput.addEventListener('input', () => {
      clearTimeout(keyDebounceTimer);
      keyDebounceTimer = setTimeout(async () => {
        const val = apiKeyInput.value.trim();
        if (!val) {
          keyStatusMsg.textContent = '';
          return;
        }

        let encryptedKey = val;
        if (window.HCEncrypt) {
          try {
            encryptedKey = await window.HCEncrypt.encrypt(val);
          } catch (e) {
            console.warn('[popup] Encryption error:', e);
          }
        }

        await chrome.storage.local.set({ apiKey: encryptedKey });
        keyStatusMsg.textContent = '✓ API Key saved securely';
        keyStatusMsg.style.color = '#2ea043';
        apiKeyInput.value = '';
      }, 500);
    });

    // Export Results (Fixed async bug)
    exportBtn.addEventListener('click', async () => {
      if (activeTabId <= 0) {
        alert('Please open a webpage first.');
        return;
      }

      chrome.runtime.sendMessage({ type: 'POLL_RESULTS', tabId: activeTabId }, result => {
        if (!result || result.error) {
          alert('No scan data available to export.');
          return;
        }

        const exportData = {
          url: domainBadge.textContent,
          timestamp: new Date().toISOString(),
          stats: {
            strong: result.strongCount || 0,
            notable: result.notableCount || 0,
            possible: result.possibleCount || 0,
            totalElements: result.totalElements || 0
          },
          matches: (result.hits || []).map(h => ({
            score: h.score,
            text: h.el?.textContent ? h.el.textContent.slice(0, 300) : ''
          }))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hiring-scan-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });

    // Runtime scan listener
    chrome.runtime.onMessage.addListener(msg => {
      if (msg.type === 'SCAN_COMPLETE' && msg.stats) {
        updateStats(msg.stats);
        saveHistoryEntry(msg.stats);
      }
    });
  }

  function saveHistoryEntry(stats) {
    const total = stats.total !== undefined ? stats.total : ((stats.strong || 0) + (stats.notable || 0) + (stats.possible || 0));
    const entry = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      count: total
    };

    chrome.storage.local.get('history', data => {
      const history = (data.history || []).slice(-19);
      history.push(entry);
      chrome.storage.local.set({ history });
      renderHistory(history);
    });
  }

})();
