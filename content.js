(() => {
  'use strict';

  const DEFAULTS = {
    filterEnabled: true,
    defaultMode: 'none', // none | posts | images
    users: {}
  };

  const APPLIED_ATTR = 'data-uf-applied';
  const SPOILER_SELECTOR = '.msgpost-spoiler[data-uf-image-spoiler="1"]';

  function getSettings() {
    return new Promise(resolve => chrome.storage.sync.get(DEFAULTS, resolve));
  }

  function getAuthorId(post) {
    const el = post.querySelector('.b-mtauthor[data-user_id]');
    return el?.dataset?.user_id ? String(el.dataset.user_id).trim() : '';
  }

  function ensureBaseStyle() {
    if (document.getElementById('uf-inline-style')) return;

    const style = document.createElement('style');
    style.id = 'uf-inline-style';
    style.textContent = `
      .uf-hidden-post {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function resetPost(post) {
    post.classList.remove('uf-hidden-post');

    post.querySelectorAll(SPOILER_SELECTOR).forEach(spoiler => {
      const content = spoiler.querySelector('.msgpost-spoiler-txt');
      const originalBlock = content?.firstElementChild;

      if (originalBlock) {
        spoiler.replaceWith(originalBlock);
      } else {
        spoiler.remove();
      }
    });

    post.removeAttribute(APPLIED_ATTR);
  }

  function resetAllPosts() {
    document.querySelectorAll('li.msgpost').forEach(resetPost);
  }

  function hidePost(post) {
    post.classList.add('uf-hidden-post');
  }

  function createImageSpoiler(block) {
    if (!block?.parentNode) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'msgpost-spoiler';
    wrapper.dataset.ufImageSpoiler = '1';

    const outer = document.createElement('div');
    outer.className = 'msgpost-spoiler-outer';

    const inner = document.createElement('div');
    inner.className = 'msgpost-spoiler-i';

    const header = document.createElement('a');
    header.href = '#';
    header.className = 'msgpost-spoiler-hd';
    header.textContent = 'Изображение';

    const content = document.createElement('div');
    content.className = 'msgpost-spoiler-txt';

    block.parentNode.insertBefore(wrapper, block);
    content.appendChild(block);
    inner.appendChild(header);
    outer.append(inner, content);
    wrapper.appendChild(outer);
  }

  function hideImages(post) {
    const images = post.querySelectorAll('.content img');
    const processedBlocks = new Set();

    images.forEach(img => {
      const inQuote = !!img.closest('blockquote');
      const block =
        img.closest('.posted-image') ||
        img.closest('.imagebox') ||
        img.closest('.thumb') ||
        img.closest('.attachbox') ||
        (inQuote ? null : img.closest('blockquote')) ||
        img.closest('div') ||
        img;

      if (!block || processedBlocks.has(block) || block.closest('.msgpost-spoiler')) {
        return;
      }

      processedBlocks.add(block);
      createImageSpoiler(block);
    });
  }

  function applyToPost(post, settings) {
    const userId = getAuthorId(post);
    const mode = settings.users?.[userId] || settings.defaultMode || 'none';

    if (mode === 'posts') {
      hidePost(post);
    } else if (mode === 'images') {
      hideImages(post);
    }

    post.setAttribute(APPLIED_ATTR, '1');
  }

  function isManagedSpoilerNode(node) {
    return node instanceof Element && !!node.closest(SPOILER_SELECTOR);
  }

  function shouldIgnoreMutations(records) {
    return records.length > 0 && records.every(record => {
      if (!isManagedSpoilerNode(record.target)) {
        return false;
      }

      for (const node of record.addedNodes) {
        if (!isManagedSpoilerNode(node)) {
          return false;
        }
      }

      for (const node of record.removedNodes) {
        if (!isManagedSpoilerNode(node)) {
          return false;
        }
      }

      return true;
    });
  }

  let observerInstalled = false;
  let observer = null;

  function stopObserver() {
    if (observer) {
      observer.disconnect();
    }
  }

  function startObserver() {
    if (observer) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  async function applyAll({ reset = true } = {}) {
    stopObserver();

    try {
      ensureBaseStyle();

      const settings = await getSettings();

      if (reset) {
        resetAllPosts();
      }

      if (!settings.filterEnabled) {
        return;
      }

      const posts = reset
        ? document.querySelectorAll('li.msgpost')
        : document.querySelectorAll(`li.msgpost:not([${APPLIED_ATTR}])`);

      for (const post of posts) {
        applyToPost(post, settings);
      }
    } finally {
      startObserver();
    }
  }

  function installObserver() {
    if (observerInstalled || !document.body) return;
    observerInstalled = true;

    observer = new MutationObserver((records) => {
      if (shouldIgnoreMutations(records)) {
        return;
      }

      clearTimeout(window.__ufObserverTimer);
      window.__ufObserverTimer = setTimeout(() => {
        applyAll({ reset: false }).catch(console.error);
      }, 150);
    });

    startObserver();
  }

  function installListeners() {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg?.type === 'settings-updated') {
        applyAll({ reset: true }).catch(console.error);
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;

      const relevant =
        'filterEnabled' in changes ||
        'defaultMode' in changes ||
        'users' in changes;

      if (relevant) {
        applyAll({ reset: true }).catch(console.error);
      }
    });
  }

  function boot() {
    applyAll({ reset: true }).catch(console.error);
    installObserver();
    installListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
