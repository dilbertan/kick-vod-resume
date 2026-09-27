/**
 * Kick VOD Resume - Popup Controller
 * Queries the active Kick VOD tab, stores records in local storage, and allows
 * users to manage saved VODs and resume playback from their exact position.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const activeVodCard = document.getElementById('activeVodCard');
  const notOnVodNotice = document.getElementById('notOnVodNotice');
  const activeChannel = document.getElementById('activeChannel');
  const activeTimeDisplay = document.getElementById('activeTimeDisplay');
  const activeTitle = document.getElementById('activeTitle');
  const btnSaveCurrent = document.getElementById('btnSaveCurrent');
  const btnSaveText = document.getElementById('btnSaveText');

  const recordsList = document.getElementById('recordsList');
  const emptyState = document.getElementById('emptyState');
  const recordCount = document.getElementById('recordCount');
  const btnClearAll = document.getElementById('btnClearAll');
  const searchBox = document.getElementById('searchBox');
  const searchInput = document.getElementById('searchInput');

  const clearModal = document.getElementById('clearModal');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');

  // Application State
  let activeTabInfo = null;
  let allRecords = [];
  let liveTimerInterval = null;

  /**
   * Formats seconds into HH:MM:SS (e.g. 3665 -> "01:01:05")
   */
  function formatTime(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  /**
   * Converts timestamp to human-readable English date (e.g. "Today, 14:32")
   */
  function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();

    const isToday = date.toDateString() === now.toDateString();
    
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (isToday) {
      return `Today, ${timeStr}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${timeStr}`;
    }

    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  /**
   * Queries the active browser tab to check if it's on a Kick VOD.
   */
  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url) {
        setNotOnVodState();
        return;
      }

      if (!tab.url.includes('kick.com')) {
        setNotOnVodState();
        return;
      }

      // Query content script
      chrome.tabs.sendMessage(tab.id, { action: 'GET_VOD_INFO' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.isVod) {
          setNotOnVodState();
          return;
        }

        activeTabInfo = {
          tabId: tab.id,
          ...response
        };

        // Show active VOD UI
        statusDot.classList.add('active');
        statusText.textContent = 'Kick VOD Detected';
        activeVodCard.style.display = 'flex';
        notOnVodNotice.style.display = 'none';

        activeChannel.textContent = activeTabInfo.channel || 'Kick Channel';
        activeTitle.textContent = activeTabInfo.title || 'Stream Recording';
        activeTitle.title = activeTabInfo.title || '';
        activeTimeDisplay.textContent = formatTime(activeTabInfo.currentTime);

        // Start live timer if video is actively playing
        startLiveTimer();
      });
    } catch (err) {
      console.warn('[Kick VOD Popup] Tab status query failed:', err);
      setNotOnVodState();
    }
  }

  function setNotOnVodState() {
    statusDot.classList.remove('active');
    statusText.textContent = 'Not on VOD';
    activeVodCard.style.display = 'none';
    notOnVodNotice.style.display = 'flex';
    if (liveTimerInterval) clearInterval(liveTimerInterval);
  }

  function startLiveTimer() {
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    liveTimerInterval = setInterval(() => {
      if (!activeTabInfo || !activeTabInfo.tabId) return;
      chrome.tabs.sendMessage(activeTabInfo.tabId, { action: 'GET_VOD_INFO' }, (res) => {
        if (res && res.isVod && !chrome.runtime.lastError) {
          activeTabInfo.currentTime = res.currentTime;
          activeTabInfo.duration = res.duration;
          activeTimeDisplay.textContent = formatTime(res.currentTime);
        }
      });
    }, 1000);
  }

  /**
   * Loads saved records from chrome.storage.local and renders list.
   */
  async function loadRecords() {
    try {
      const data = await chrome.storage.local.get(['kick_vod_records']);
      allRecords = data.kick_vod_records || [];
      renderRecords();
    } catch (err) {
      console.error('[Kick VOD Popup] Error loading records:', err);
    }
  }

  /**
   * Renders saved VOD cards to DOM (supports search filtering).
   */
  function renderRecords() {
    const query = searchInput.value.trim().toLowerCase();
    
    // Apply search filter
    const filtered = allRecords.filter(r => {
      if (!query) return true;
      return (r.channel && r.channel.toLowerCase().includes(query)) ||
             (r.title && r.title.toLowerCase().includes(query));
    });

    recordCount.textContent = allRecords.length;

    if (allRecords.length === 0) {
      emptyState.style.display = 'flex';
      recordsList.style.display = 'none';
      btnClearAll.style.display = 'none';
      searchBox.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    recordsList.style.display = 'flex';
    btnClearAll.style.display = 'block';
    searchBox.style.display = allRecords.length > 2 ? 'flex' : 'none';

    recordsList.innerHTML = '';

    if (filtered.length === 0) {
      recordsList.innerHTML = `
        <div style="text-align:center; padding: 20px; color: var(--text-muted); font-size: 12px;">
          No records matching "${escapeHtml(query)}" found.
        </div>
      `;
      return;
    }

    filtered.forEach((record) => {
      const card = createRecordCard(record);
      recordsList.appendChild(card);
    });
  }

  /**
   * Creates a single VOD record card DOM element.
   */
  function createRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'record-item';

    const currentFormatted = formatTime(record.currentTime);
    const durationFormatted = record.duration ? formatTime(record.duration) : null;
    const dateFormatted = formatDate(record.savedAt);

    // Progress percentage
    let percent = 0;
    if (record.duration && record.duration > 0) {
      percent = Math.min(100, Math.round((record.currentTime / record.duration) * 100));
    }

    card.innerHTML = `
      <div class="record-header">
        <span class="record-channel">${escapeHtml(record.channel || 'Kick')}</span>
        <span class="record-date">${dateFormatted}</span>
      </div>
      
      <div class="record-title" title="${escapeHtml(record.title || '')}">
        ${escapeHtml(record.title || 'Untitled VOD')}
      </div>
      
      <div class="record-progress-info">
        <span class="record-timestamp">${currentFormatted}</span>
        ${durationFormatted ? `<span class="record-duration">/ ${durationFormatted} (${percent}%)</span>` : ''}
      </div>

      ${record.duration ? `
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${percent}%;"></div>
        </div>
      ` : ''}

      <div class="record-actions">
        <button class="btn-resume" data-action="resume">
          <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span>Resume Playback</span>
        </button>
        <button class="btn-delete" data-action="delete" title="Delete record">
          <svg viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    `;

    // Button event listeners
    const btnResume = card.querySelector('[data-action="resume"]');
    btnResume.addEventListener('click', () => {
      resumeVod(record);
    });

    const btnDelete = card.querySelector('[data-action="delete"]');
    btnDelete.addEventListener('click', () => {
      deleteRecord(record.videoId);
    });

    return card;
  }

  /**
   * Handles "Save Current Timestamp" button click.
   */
  btnSaveCurrent.addEventListener('click', async () => {
    if (!activeTabInfo || !activeTabInfo.tabId) return;

    // Request fresh timestamp directly from video element in page
    chrome.tabs.sendMessage(activeTabInfo.tabId, { action: 'QUICK_SAVE' }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        console.warn('[Kick VOD Popup] Quick save failed.');
        return;
      }

      // Visual feedback on save button
      btnSaveCurrent.classList.add('btn-saved-success');
      btnSaveText.textContent = `Saved! (${formatTime(response.record.currentTime)}) ✓`;

      setTimeout(() => {
        btnSaveCurrent.classList.remove('btn-saved-success');
        btnSaveText.textContent = 'Save Current Timestamp';
      }, 2000);

      // Refresh records list
      await loadRecords();
    });
  });

  /**
   * Resumes VOD playback from saved position.
   */
  async function resumeVod(record) {
    const targetSeconds = record.currentTime || 0;
    const targetUrlWithTime = `${record.cleanUrl}?t=${targetSeconds}`;

    try {
      // 1. Check if the VOD is already open in an existing tab
      const tabs = await chrome.tabs.query({});
      const matchingTab = tabs.find(t => t.url && (t.url.includes(record.videoId) || (record.cleanUrl && t.url.includes(record.cleanUrl))));

      if (matchingTab && matchingTab.id) {
        // Bring existing tab to focus
        await chrome.tabs.update(matchingTab.id, { active: true });
        if (matchingTab.windowId) {
          await chrome.windows.update(matchingTab.windowId, { focused: true });
        }

        // Send direct seek message to content script
        chrome.tabs.sendMessage(matchingTab.id, { action: 'SEEK_TO', time: targetSeconds }, (res) => {
          if (chrome.runtime.lastError) {
            // Content script not ready yet, update URL directly
            chrome.tabs.update(matchingTab.id, { url: targetUrlWithTime });
          }
          window.close();
        });
      } else {
        // Open new tab with timestamp URL parameter
        await chrome.tabs.create({ url: targetUrlWithTime, active: true });
        window.close();
      }
    } catch (err) {
      console.error('[Kick VOD Popup] Error opening VOD:', err);
      window.open(targetUrlWithTime, '_blank');
      window.close();
    }
  }

  /**
   * Deletes a single VOD record.
   */
  async function deleteRecord(videoId) {
    try {
      allRecords = allRecords.filter(r => r.videoId !== videoId);
      await chrome.storage.local.set({ kick_vod_records: allRecords });
      renderRecords();
    } catch (err) {
      console.error('[Kick VOD Popup] Could not delete record:', err);
    }
  }

  /**
   * Clear All confirmation modal handlers
   */
  btnClearAll.addEventListener('click', () => {
    clearModal.style.display = 'flex';
  });

  modalCancelBtn.addEventListener('click', () => {
    clearModal.style.display = 'none';
  });

  modalConfirmBtn.addEventListener('click', async () => {
    try {
      allRecords = [];
      await chrome.storage.local.set({ kick_vod_records: [] });
      clearModal.style.display = 'none';
      renderRecords();
    } catch (err) {
      console.error('[Kick VOD Popup] Could not clear records:', err);
    }
  });

  // Close modal on backdrop click
  clearModal.addEventListener('click', (e) => {
    if (e.target === clearModal) {
      clearModal.style.display = 'none';
    }
  });

  // Search input listener
  searchInput.addEventListener('input', () => {
    renderRecords();
  });

  // Escape HTML characters helper
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Listen for storage changes (e.g. shortcut triggered save)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.kick_vod_records) {
      allRecords = changes.kick_vod_records.newValue || [];
      renderRecords();
    }
  });

  // Initialize
  checkActiveTab();
  loadRecords();
});
