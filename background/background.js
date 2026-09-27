/**
 * Kick VOD Resume - Background Service Worker
 * Manages keyboard shortcuts, tab events, and extension icon badge notifications.
 */

// Initialize badge when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Synchronize badge count when records in storage change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.kick_vod_records) {
    updateBadgeWithCount(changes.kick_vod_records.newValue?.length || 0);
  }
});

/**
 * Updates the extension action badge.
 */
async function updateBadge() {
  try {
    const data = await chrome.storage.local.get(['kick_vod_records']);
    const count = data.kick_vod_records?.length || 0;
    updateBadgeWithCount(count);
  } catch (e) {
    console.error('[Kick VOD Resume Background] Failed to update badge:', e);
  }
}

function updateBadgeWithCount(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#53fc18' });
    chrome.action.setBadgeTextColor({ color: '#0b0e0f' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Keyboard shortcut listener (e.g. Alt+Shift+S)
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-save') {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id || !activeTab.url) return;

    if (!activeTab.url.includes('kick.com')) {
      return;
    }

    try {
      chrome.tabs.sendMessage(activeTab.id, { action: 'QUICK_SAVE' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Kick VOD Resume] Could not send message to tab:', chrome.runtime.lastError.message);
        }
      });
    } catch (err) {
      console.error('[Kick VOD Resume] Error processing shortcut:', err);
    }
  }
});
