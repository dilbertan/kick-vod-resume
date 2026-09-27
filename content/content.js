/**
 * Kick VOD Resume - Content Script
 * Monitors the video player (<video>) on Kick.com pages, tracks current playback time,
 * and seeks playback based on URL parameter or popup commands.
 */

(function () {
  'use strict';

  // Prevent double injection
  if (window.__KICK_VOD_RESUME_INJECTED__) return;
  window.__KICK_VOD_RESUME_INJECTED__ = true;

  console.log('[Kick VOD Resume] Content script initialized.');

  let lastUrl = window.location.href;
  let hasAutoResumedForCurrentUrl = false;

  /**
   * Formats seconds into readable time string (e.g. "01:24:15" or "05:30")
   */
  function formatSeconds(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  /**
   * Checks whether the current page is a Kick VOD page and parses metadata.
   * Supported URL patterns:
   * - kick.com/{channel}/videos/{videoId}
   * - kick.com/{channel}/video/{videoId}
   * - kick.com/video/{videoId}
   */
  function parseVodUrl(url = window.location.href) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Matches /xqc/videos/abc-123 or /video/abc-123
      const vodRegex = /^(?:\/([a-zA-Z0-9_\-\.]+))?\/(?:videos?)\/([a-zA-Z0-9_\-]+)/i;
      const match = pathname.match(vodRegex);

      if (!match) return null;

      let channel = match[1] || '';
      const videoId = match[2];

      // If channel is not in pathname (e.g. "kick.com/video/123"), attempt to find via DOM
      if (!channel) {
        const channelLink = document.querySelector('a[href^="/"][class*="channel"], a[href^="/"][class*="streamer"]');
        if (channelLink) {
          channel = channelLink.getAttribute('href').replace(/^\//, '').split('/')[0];
        }
      }

      // Clean, parameter-free VOD URL
      const cleanUrl = channel 
        ? `https://kick.com/${channel}/videos/${videoId}` 
        : `https://kick.com/video/${videoId}`;

      return {
        isVod: true,
        channel: channel || 'Unknown Channel',
        videoId: videoId,
        cleanUrl: cleanUrl
      };
    } catch (e) {
      console.error('[Kick VOD Resume] URL parsing error:', e);
      return null;
    }
  }

  /**
   * Intelligently detects the real main Kick VOD player on the page.
   * Filters out sidebar previews, animated avatars, and small preview loops.
   */
  function getMainVideoElement() {
    // 1. Check known Kick player selectors first
    const directSelectors = [
      '#video-player video',
      'video#video-player',
      'div#video-player video',
      '[data-testid="video-player"] video',
      'main video',
      '#channel-subview video',
      '.vjs-tech',
      'video.vjs-tech',
      'div[class*="player"] video'
    ];

    for (const selector of directSelectors) {
      const candidates = document.querySelectorAll(selector);
      for (const el of candidates) {
        if (isValidMainVideo(el)) {
          return el;
        }
      }
    }

    // 2. Query all video elements and pick the highest scored one
    const allVideos = Array.from(document.querySelectorAll('video'));
    if (allVideos.length === 0) return null;
    if (allVideos.length === 1 && isValidMainVideo(allVideos[0])) {
      return allVideos[0];
    }

    let bestVideo = null;
    let highestScore = -Infinity;

    for (const video of allVideos) {
      const score = calculateVideoScore(video);
      if (score > highestScore) {
        highestScore = score;
        bestVideo = video;
      }
    }

    return (highestScore > 0 && bestVideo) ? bestVideo : (allVideos[0] || null);
  }

  /**
   * Verifies if a video element is genuine main content rather than a sidebar preview.
   */
  function isValidMainVideo(v) {
    if (!v) return false;

    // Exclude sidebar, chat, and nav containers
    if (v.closest('aside, nav, header, [class*="sidebar"], [class*="channel-list"], [class*="chat"], [class*="preview"], [id*="sidebar"]')) {
      return false;
    }

    // Dimension check
    const rect = v.getBoundingClientRect();
    if (rect.width < 250 || rect.height < 140) {
      return false;
    }

    // Reject short looping previews
    if (v.loop && v.duration && v.duration <= 4) {
      return false;
    }

    return true;
  }

  /**
   * Scores video elements to reliably pick the primary player.
   */
  function calculateVideoScore(v) {
    let score = 0;

    // 1. Excluded containers
    if (v.closest('aside, nav, header, [class*="sidebar"], [class*="channel-list"], [class*="chat"], [class*="preview"], [id*="sidebar"]')) {
      return -10000;
    }

    // 2. Physical size score
    const rect = v.getBoundingClientRect();
    const area = rect.width * rect.height;

    if (rect.width >= 450 && rect.height >= 250) {
      score += 2000;
    } else if (rect.width >= 300 && rect.height >= 180) {
      score += 800;
    } else if (rect.width < 200 || rect.height < 120) {
      score -= 3000;
    }

    score += Math.min(Math.floor(area / 100), 2000);

    // 3. Known ID and class tags
    if (v.id === 'video-player' || v.closest('#video-player') || v.classList.contains('vjs-tech')) {
      score += 3000;
    }
    if (v.closest('main') || v.closest('#channel-subview')) {
      score += 1500;
    }
    if (v.closest('[class*="player"]')) {
      score += 1000;
    }

    // 4. Duration check
    if (!isNaN(v.duration) && v.duration > 0 && v.duration !== Infinity) {
      if (v.duration > 60) {
        score += 2500;
      } else if (v.duration <= 3) {
        score -= 4000;
      }
    }

    // 5. Loop check
    if (v.loop) {
      score -= 2000;
    }

    // 6. Visibility check
    if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(v).display !== 'none' && window.getComputedStyle(v).visibility !== 'hidden') {
      score += 500;
    } else {
      score -= 5000;
    }

    return score;
  }

  /**
   * Waits for the video element to be available in the DOM.
   */
  function waitForVideo(timeoutMs = 20000) {
    return new Promise((resolve) => {
      const existing = getMainVideoElement();
      if (existing) {
        resolve(existing);
        return;
      }

      const startTime = Date.now();
      const interval = setInterval(() => {
        const vid = getMainVideoElement();
        if (vid) {
          clearInterval(interval);
          resolve(vid);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          resolve(document.querySelector('video'));
        }
      }, 250);
    });
  }

  /**
   * Extracts VOD title and channel name from the page.
   */
  function extractVodMetadata() {
    const vodInfo = parseVodUrl();
    if (!vodInfo) return null;

    let title = '';
    const titleElem = document.querySelector('h1, h2[class*="title"], [data-testid="vod-title"], .video-title');
    if (titleElem && titleElem.textContent.trim()) {
      title = titleElem.textContent.trim();
    } else {
      title = document.title.replace(/\s*[-|•]\s*Kick.*$/i, '').trim();
    }

    let channel = vodInfo.channel;
    if (!channel) {
      const mainArea = document.querySelector('main') || document.body;
      const channelElem = mainArea.querySelector('[data-channel-name], a[href^="/"][class*="username"], span[class*="channel-name"]');
      if (channelElem && channelElem.textContent.trim()) {
        channel = channelElem.textContent.trim();
      }
    }

    return {
      channel: channel || 'Kick Streamer',
      title: title || 'Kick Stream VOD',
      videoId: vodInfo.videoId,
      cleanUrl: vodInfo.cleanUrl
    };
  }

  /**
   * Displays a stylish Kick-themed toast notification on bottom right of the screen.
   */
  function showToast({ title, message, actions = [], duration = 4500 }) {
    let container = document.getElementById('kvr-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'kvr-toast-container';
      container.className = 'kvr-toast-container';
      document.body.appendChild(container);
    }

    container.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = 'kvr-toast';

    const iconSvg = `
      <svg viewBox="0 0 24 24">
        <path d="M4 3h4v8.5l6-8.5h5l-7.5 9.5L20 21h-5l-7-9.5V21H4V3z"/>
      </svg>
    `;

    let actionsHtml = '';
    if (actions && actions.length > 0) {
      actionsHtml = `
        <div class="kvr-toast-actions">
          ${actions.map((act, i) => `<button class="${act.className || 'kvr-btn-resume'}" data-action-idx="${i}">${act.text}</button>`).join('')}
        </div>
      `;
    }

    toast.innerHTML = `
      <div class="kvr-toast-icon">${iconSvg}</div>
      <div class="kvr-toast-content">
        <div class="kvr-toast-title">${title}</div>
        <div class="kvr-toast-desc">${message}</div>
        ${actionsHtml}
      </div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('kvr-show');
    });

    if (actions && actions.length > 0) {
      actions.forEach((act, idx) => {
        const btn = toast.querySelector(`[data-action-idx="${idx}"]`);
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            act.onClick && act.onClick();
            closeToast(toast);
          });
        }
      });
    }

    function closeToast(t) {
      t.classList.remove('kvr-show');
      setTimeout(() => {
        if (t.parentElement) t.parentElement.removeChild(t);
      }, 300);
    }

    if (duration > 0) {
      setTimeout(() => {
        if (toast.classList.contains('kvr-show')) {
          closeToast(toast);
        }
      }, duration);
    }
  }

  /**
   * Seeks the video to the target playback time and ensures playback continues.
   */
  async function seekToTime(targetSeconds, isUserPrompted = false) {
    const video = await waitForVideo();
    if (!video) {
      console.warn('[Kick VOD Resume] Video element not found.');
      return false;
    }

    const performSeek = () => {
      try {
        video.currentTime = targetSeconds;
        video.play().catch(() => {});
        showToast({
          title: 'Resuming Playback',
          message: `Player jumped to <b>${formatSeconds(targetSeconds)}</b>.`,
          duration: 3500
        });
      } catch (err) {
        console.error('[Kick VOD Resume] Error during seek operation:', err);
      }
    };

    if (video.readyState >= 1) {
      performSeek();
    } else {
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        performSeek();
      };
      video.addEventListener('loadedmetadata', onLoaded);
      setTimeout(performSeek, 3000);
    }

    return true;
  }

  /**
   * Checks for URL timestamp parameter (?t=, ?kick_t=, etc.) or existing saved position on initial load.
   */
  async function checkInitialResume() {
    const vodInfo = parseVodUrl();
    if (!vodInfo) return;

    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    let targetTime = null;

    if (urlParams.has('t')) {
      targetTime = parseFloat(urlParams.get('t'));
    } else if (urlParams.has('kick_t')) {
      targetTime = parseFloat(urlParams.get('kick_t'));
    } else if (urlParams.has('time')) {
      const rawTime = urlParams.get('time');
      if (!isNaN(parseFloat(rawTime))) {
        targetTime = parseFloat(rawTime);
      }
    } else if (hash && hash.startsWith('#t=')) {
      targetTime = parseFloat(hash.replace('#t=', ''));
    }

    // 1. Direct seek if URL timestamp parameter exists
    if (targetTime !== null && !isNaN(targetTime) && targetTime > 0) {
      hasAutoResumedForCurrentUrl = true;
      await seekToTime(targetTime);
      return;
    }

    // 2. Check local storage if no URL parameter
    try {
      const data = await chrome.storage.local.get(['kick_vod_records', 'kick_vod_settings']);
      const records = data.kick_vod_records || [];
      const settings = data.kick_vod_settings || { smartToast: true, autoSave: false };

      const existingRecord = records.find(r => r.videoId === vodInfo.videoId);

      if (existingRecord && existingRecord.currentTime > 5 && settings.smartToast !== false) {
        showToast({
          title: 'Previous Progress Found',
          message: `You previously left off at <b>${formatSeconds(existingRecord.currentTime)}</b>.`,
          actions: [
            {
              text: 'Resume Playback',
              className: 'kvr-btn-resume',
              onClick: () => {
                seekToTime(existingRecord.currentTime, true);
              }
            },
            {
              text: 'Start from Beginning',
              className: 'kvr-btn-dismiss',
              onClick: () => {}
            }
          ],
          duration: 9000
        });
      }
    } catch (err) {
      console.warn('[Kick VOD Resume] Error checking records:', err);
    }
  }

  /**
   * Performs quick save of current playback position to chrome.storage.local.
   */
  async function performQuickSave() {
    const vodInfo = parseVodUrl();
    if (!vodInfo) {
      showToast({
        title: 'Could Not Save',
        message: 'You are not currently on an active Kick VOD page.',
        duration: 3000
      });
      return { success: false, reason: 'NOT_A_VOD' };
    }

    const video = getMainVideoElement();
    if (!video) {
      showToast({
        title: 'Video Not Found',
        message: 'The video player on this page is not ready yet.',
        duration: 3000
      });
      return { success: false, reason: 'NO_VIDEO_ELEMENT' };
    }

    const meta = extractVodMetadata();
    const currentTime = Math.floor(video.currentTime);
    const duration = Math.floor(video.duration) || 0;

    const newRecord = {
      videoId: meta.videoId,
      channel: meta.channel,
      title: meta.title,
      currentTime: currentTime,
      duration: duration,
      cleanUrl: meta.cleanUrl,
      savedAt: Date.now()
    };

    try {
      const data = await chrome.storage.local.get(['kick_vod_records']);
      let records = data.kick_vod_records || [];

      // Update existing record or prepend new one
      records = records.filter(r => r.videoId !== newRecord.videoId);
      records.unshift(newRecord);

      await chrome.storage.local.set({ kick_vod_records: records });

      showToast({
        title: 'Playback Position Saved ✓',
        message: `<b>${meta.channel}</b> - <b>${formatSeconds(currentTime)}</b>`,
        duration: 3500
      });

      return { success: true, record: newRecord };
    } catch (err) {
      console.error('[Kick VOD Resume] Save error:', err);
      showToast({
        title: 'Save Error',
        message: 'Could not write progress to local storage.',
        duration: 3000
      });
      return { success: false, error: err.message };
    }
  }

  /**
   * Extension messaging listener.
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_VOD_INFO') {
      const vodInfo = parseVodUrl();
      if (!vodInfo) {
        sendResponse({ success: false, isVod: false, reason: 'Not a Kick VOD page.' });
        return true;
      }

      const video = getMainVideoElement();
      const meta = extractVodMetadata();

      sendResponse({
        success: true,
        isVod: true,
        hasVideo: !!video,
        videoId: meta.videoId,
        channel: meta.channel,
        title: meta.title,
        cleanUrl: meta.cleanUrl,
        currentTime: video ? Math.floor(video.currentTime) : 0,
        duration: video && !isNaN(video.duration) ? Math.floor(video.duration) : 0,
        paused: video ? video.paused : true
      });
      return true;
    }

    if (request.action === 'SEEK_TO') {
      seekToTime(request.time).then((ok) => {
        sendResponse({ success: ok });
      });
      return true;
    }

    if (request.action === 'QUICK_SAVE') {
      performQuickSave().then((result) => {
        sendResponse(result);
      });
      return true;
    }

    return false;
  });

  /**
   * Monitor URL changes for Kick Single Page Application (SPA) navigation.
   */
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      hasAutoResumedForCurrentUrl = false;
      setTimeout(checkInitialResume, 1000);
    }
  }, 1000);

  // Initial check on load
  setTimeout(checkInitialResume, 800);

})();
