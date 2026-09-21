// Isaac Item Guide Client Application
(function() {
  'use strict';

  // State
  let allItems = [];
  let filteredItems = [];
  let selectedItem = null;

  const filters = {
    search: '',
    type: 'all',
    quality: 'all',
    unlock: 'all',
    color: 'all',
    dlc: 'all',
    sort: 'color_asc',
  };

  // DOM Elements
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const sortSelect = document.getElementById('sortSelect');
  const itemsGrid = document.getElementById('itemsGrid');
  const emptyState = document.getElementById('emptyState');
  const emptyResetBtn = document.getElementById('emptyResetBtn');
  const resultsCount = document.getElementById('resultsCount');
  const itemTooltip = document.getElementById('itemTooltip');

  // Side Panel Elements
  const sidePlaceholder = document.getElementById('sidePlaceholder');
  const sideContent = document.getElementById('sideContent');
  const closeSideBtn = document.getElementById('closeSideBtn');
  const panelIcon = document.getElementById('panelIcon');
  const panelId = document.getElementById('panelId');
  const panelType = document.getElementById('panelType');
  const panelQuality = document.getElementById('panelQuality');
  const panelDlcTag = document.getElementById('panelDlcTag');
  const panelName = document.getElementById('panelName');
  const panelQuote = document.getElementById('panelQuote');
  const panelDlcNotice = document.getElementById('panelDlcNotice');
  const panelDlcText = document.getElementById('panelDlcText');
  const panelDesc = document.getElementById('panelDesc');
  const panelUnlockBlock = document.getElementById('panelUnlockBlock');
  const panelUnlock = document.getElementById('panelUnlock');

  // Quality Names
  const qualityNames = {
    4: 'Quality 4 (God Tier)',
    3: 'Quality 3 (Great)',
    2: 'Quality 2 (Good)',
    1: 'Quality 1 (Decent)',
    0: 'Quality 0 (Situational)',
  };

  // DLC Helper mapping by game_id
  function getItemDlc(item) {
    const id = item.game_id;
    if (id <= 346) {
      return {
        key: 'rebirth',
        name: 'Rebirth',
        badge: 'Rebirth (Base Game)',
        requiresDlc: false,
        desc: 'Base Game (No DLC required)',
      };
    }
    if (id <= 441) {
      return {
        key: 'afterbirth',
        name: 'Afterbirth',
        badge: 'Afterbirth DLC',
        requiresDlc: true,
        desc: 'Requires Afterbirth DLC',
      };
    }
    if (id <= 552) {
      return {
        key: 'afterbirthplus',
        name: 'Afterbirth+',
        badge: 'Afterbirth+ DLC',
        requiresDlc: true,
        desc: 'Requires Afterbirth+ DLC',
      };
    }
    return {
      key: 'repentance',
      name: 'Repentance',
      badge: 'Repentance DLC',
      requiresDlc: true,
      desc: 'Requires Repentance DLC',
    };
  }

  async function init() {
    setupEventListeners();
    await loadData();
  }

  async function loadData() {
    try {
      const res = await fetch('data/items.json');
      if (res.ok) {
        const json = await res.json();
        allItems = Array.isArray(json) ? json : (json.data || []);
      } else {
        throw new Error('Static items fetch failed');
      }
    } catch (err) {
      console.warn('Trying /api/items fallback', err);
      try {
        const res = await fetch('/api/items?sort=color');
        const json = await res.json();
        allItems = Array.isArray(json) ? json : (json.data || []);
      } catch (e) {
        console.error('Failed to load items:', e);
      }
    }

    applyFilters();
  }

  function setupEventListeners() {
    // Search input
    searchInput.addEventListener('input', (e) => {
      filters.search = e.target.value.trim().toLowerCase();
      clearSearchBtn.style.display = filters.search ? 'block' : 'none';
      applyFilters();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      filters.search = '';
      clearSearchBtn.style.display = 'none';
      searchInput.focus();
      applyFilters();
    });

    // Keyboard shortcuts & Arrow Key Navigation
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }
      if (e.key === 'Escape') {
        if (selectedItem) {
          deselectItem();
        } else if (filters.search) {
          searchInput.value = '';
          filters.search = '';
          clearSearchBtn.style.display = 'none';
          applyFilters();
        }
        return;
      }

      // Arrow navigation across items in grid
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (document.activeElement === searchInput) return;
        if (filteredItems.length === 0) return;

        e.preventDefault();
        const currentIndex = selectedItem ? filteredItems.findIndex(i => i.id === selectedItem.id) : -1;
        let newIndex = currentIndex;

        const gridWidth = itemsGrid.clientWidth;
        const firstSprite = itemsGrid.querySelector('.item-sprite');
        const spriteW = firstSprite ? firstSprite.offsetWidth + 4 : 86;
        const cols = Math.max(1, Math.floor(gridWidth / spriteW));

        if (e.key === 'ArrowRight') {
          newIndex = currentIndex < filteredItems.length - 1 ? currentIndex + 1 : 0;
        } else if (e.key === 'ArrowLeft') {
          newIndex = currentIndex > 0 ? currentIndex - 1 : filteredItems.length - 1;
        } else if (e.key === 'ArrowDown') {
          newIndex = Math.min(filteredItems.length - 1, (currentIndex === -1 ? 0 : currentIndex) + cols);
        } else if (e.key === 'ArrowUp') {
          newIndex = Math.max(0, currentIndex - cols);
        }

        if (newIndex >= 0 && newIndex < filteredItems.length) {
          const nextItem = filteredItems[newIndex];
          const btn = itemsGrid.querySelector(`[data-id="${nextItem.id}"]`);
          selectItem(nextItem, btn);
          if (btn) {
            btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }
      }
    });

    // Copy item details on clicking panelId
    if (panelId) {
      panelId.addEventListener('click', () => {
        if (!selectedItem) return;
        const dlc = getItemDlc(selectedItem);
        const dlcPart = dlc.requiresDlc ? ` [${dlc.name} DLC]` : '';
        const text = `${selectedItem.name} (#${String(selectedItem.game_id).padStart(3, '0')})${dlcPart}`;
        navigator.clipboard.writeText(text).then(() => {
          const orig = panelId.textContent;
          panelId.textContent = 'Copied!';
          panelId.classList.add('copied');
          setTimeout(() => {
            panelId.textContent = orig;
            panelId.classList.remove('copied');
          }, 1200);
        }).catch(() => {});
      });
    }

    // Clicking brand title returns to home page
    const brandHomeLink = document.getElementById('brandHomeLink');
    if (brandHomeLink) {
      brandHomeLink.addEventListener('click', (e) => {
        e.preventDefault();
        history.pushState(null, '', '/');
        resetFilters();
        deselectItem();
        itemsGrid.scrollTop = 0;
      });
    }

    const quickResetBtn = document.getElementById('quickResetBtn');
    if (quickResetBtn) {
      quickResetBtn.addEventListener('click', resetFilters);
    }

    // Sort select
    sortSelect.addEventListener('change', (e) => {
      filters.sort = e.target.value;
      applyFilters();
    });

    // Filter Buttons (Type, Quality, Unlock, Color, DLC)
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.parentElement;
        group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.dataset.type) filters.type = btn.dataset.type;
        if (btn.dataset.quality) filters.quality = btn.dataset.quality;
        if (btn.dataset.unlock) filters.unlock = btn.dataset.unlock;
        if (btn.dataset.color) filters.color = btn.dataset.color;
        if (btn.dataset.dlc) filters.dlc = btn.dataset.dlc;

        applyFilters();
      });
    });

    emptyResetBtn.addEventListener('click', resetFilters);
    closeSideBtn.addEventListener('click', deselectItem);
  }

  function resetFilters() {
    filters.search = '';
    filters.type = 'all';
    filters.quality = 'all';
    filters.unlock = 'all';
    filters.color = 'all';
    filters.dlc = 'all';
    filters.sort = 'color_asc';

    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    sortSelect.value = 'color_asc';

    document.querySelectorAll('.filter-btn').forEach(b => {
      const val = b.dataset.type || b.dataset.quality || b.dataset.unlock || b.dataset.color || b.dataset.dlc;
      if (val === 'all') {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    applyFilters();
  }

  function applyFilters() {
    let result = allItems.slice();

    // 1. Search
    if (filters.search) {
      const q = filters.search;
      result = result.filter(item => {
        const dlc = getItemDlc(item);
        return (
          item.name.toLowerCase().includes(q) ||
          (item.quote && item.quote.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.unlock_condition && item.unlock_condition.toLowerCase().includes(q)) ||
          dlc.name.toLowerCase().includes(q) ||
          String(item.game_id) === q
        );
      });
    }

    // 2. Type
    if (filters.type !== 'all') {
      result = result.filter(item => item.type === filters.type);
    }

    // 3. Quality
    if (filters.quality !== 'all') {
      const qNum = parseInt(filters.quality, 10);
      result = result.filter(item => item.quality === qNum);
    }

    // 4. Unlock status
    if (filters.unlock === 'default') {
      result = result.filter(item => item.is_unlocked_by_default === 1);
    } else if (filters.unlock === 'unlockable') {
      result = result.filter(item => item.is_unlocked_by_default === 0);
    }

    // 5. Color
    if (filters.color !== 'all') {
      if (filters.color === 'Mono') {
        result = result.filter(item => item.color_group === 'White' || item.color_group === 'Gray' || item.color_group === 'Black');
      } else {
        result = result.filter(item => item.color_group === filters.color);
      }
    }

    // 6. DLC
    if (filters.dlc !== 'all') {
      result = result.filter(item => {
        const dlc = getItemDlc(item);
        return dlc.key === filters.dlc;
      });
    }

    // 7. Sort
    result.sort((a, b) => {
      switch (filters.sort) {
        case 'color_asc': {
          const ordA = a.color_order !== undefined ? a.color_order : 999;
          const ordB = b.color_order !== undefined ? b.color_order : 999;
          if (ordA !== ordB) return ordA - ordB;
          return a.game_id - b.game_id;
        }
        case 'id_desc':
          return b.game_id - a.game_id;
        case 'quality_desc': {
          const qA = a.quality !== null ? a.quality : -1;
          const qB = b.quality !== null ? b.quality : -1;
          if (qB !== qA) return qB - qA;
          return (a.color_order || 0) - (b.color_order || 0);
        }
        case 'quality_asc': {
          const qA = a.quality !== null ? a.quality : 99;
          const qB = b.quality !== null ? b.quality : 99;
          if (qA !== qB) return qA - qB;
          return (a.color_order || 0) - (b.color_order || 0);
        }
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'id_asc':
          return a.game_id - b.game_id;
        default:
          return (a.color_order || 999) - (b.color_order || 999);
      }
    });

    filteredItems = result;
    resultsCount.textContent = `${filteredItems.length} items`;
    resultsCount.classList.remove('pop');
    void resultsCount.offsetWidth;
    resultsCount.classList.add('pop');

    const isFiltered = Boolean(
      filters.search ||
      filters.type !== 'all' ||
      filters.quality !== 'all' ||
      filters.unlock !== 'all' ||
      filters.color !== 'all' ||
      filters.dlc !== 'all'
    );
    const quickResetBtn = document.getElementById('quickResetBtn');
    if (quickResetBtn) {
      quickResetBtn.style.display = isFiltered ? 'inline-flex' : 'none';
    }

    renderGrid();
  }

  // Render Pure Image Grid
  function renderGrid() {
    if (filteredItems.length === 0) {
      itemsGrid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    const fragment = document.createDocumentFragment();

    for (const item of filteredItems) {
      // Naked image button - no container box, no card background
      const btn = document.createElement('button');
      const qClass = item.quality !== null ? `q${item.quality}` : 'q0';
      btn.className = `item-sprite ${qClass}`;
      btn.setAttribute('data-id', item.id);
      btn.setAttribute('type', 'button');

      if (selectedItem && selectedItem.id === item.id) {
        btn.classList.add('selected');
      }

      const img = document.createElement('img');
      img.src = item.local_image;
      img.alt = item.name;
      img.loading = 'lazy';
      img.className = 'pixelated';
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.onerror = () => {
        if (img.src !== item.image_url) {
          img.src = item.image_url;
        }
      };

      btn.appendChild(img);

      // Tooltip events on hover
      btn.addEventListener('mouseenter', (e) => showTooltip(item, e));
      btn.addEventListener('mousemove', (e) => positionTooltip(e));
      btn.addEventListener('mouseleave', hideTooltip);

      // Click to open in left side panel
      btn.addEventListener('click', () => selectItem(item, btn));

      fragment.appendChild(btn);
    }

    itemsGrid.innerHTML = '';
    itemsGrid.appendChild(fragment);
  }

  // Tooltip
  function showTooltip(item, e) {
    const qClass = item.quality !== null ? `q${item.quality}` : 'q0';
    const qBadge = item.quality !== null ? `Q${item.quality}` : '';
    const dlc = getItemDlc(item);

    itemTooltip.innerHTML = `
      <div>
        <span class="tooltip-name">${escapeHtml(item.name)}</span>
        ${qBadge ? `<span class="tooltip-quality ${qClass}">${qBadge}</span>` : ''}
        <span class="tooltip-dlc dlc-${dlc.key}">${dlc.name}</span>
      </div>
      ${item.quote ? `<div class="tooltip-quote">"${escapeHtml(item.quote)}"</div>` : ''}
    `;
    itemTooltip.style.display = 'block';
    positionTooltip(e);
  }

  function positionTooltip(e) {
    const pad = 12;
    let x = e.clientX;
    let y = e.clientY - pad;
    if (y < 60) {
      y = e.clientY + pad + 20;
      itemTooltip.style.transform = 'translate(-50%, 0%)';
    } else {
      itemTooltip.style.transform = 'translate(-50%, -100%)';
    }
    const half = 140;
    if (x - half < 8) x = half + 8;
    if (x + half > window.innerWidth - 8) x = window.innerWidth - half - 8;

    itemTooltip.style.left = `${x}px`;
    itemTooltip.style.top = `${y}px`;
  }

  function hideTooltip() {
    itemTooltip.style.display = 'none';
  }

  // Fly item animation: Hover pop in place, then fly across to left inspector
  function triggerFlyAnimation(startElement, targetElement, item) {
    if (!startElement || !targetElement) {
      if (targetElement) targetElement.style.opacity = '1';
      return;
    }

    // Clean up any existing flight clone
    document.querySelectorAll('.flying-item-clone').forEach(el => el.remove());

    const imgEl = startElement.querySelector('img') || startElement;
    const startRect = imgEl.getBoundingClientRect();
    if (startRect.width === 0 || startRect.height === 0) {
      targetElement.style.opacity = '1';
      return;
    }

    const endRect = targetElement.getBoundingClientRect();
    if (endRect.width === 0 || endRect.height === 0) {
      targetElement.style.opacity = '1';
      return;
    }

    const clone = document.createElement('img');
    clone.src = item.local_image;
    clone.alt = item.name;
    clone.className = 'flying-item-clone pixelated';
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;
    document.body.appendChild(clone);

    // Fade target icon out briefly so clone docks cleanly
    targetElement.style.opacity = '0';

    // Step 1: Hover up & scale
    requestAnimationFrame(() => {
      clone.classList.add('fly-hover');

      // Step 2: Fly to left inspector
      setTimeout(() => {
        clone.classList.remove('fly-hover');
        clone.classList.add('fly-to-target');
        clone.style.left = `${endRect.left}px`;
        clone.style.top = `${endRect.top}px`;
        clone.style.width = `${endRect.width}px`;
        clone.style.height = `${endRect.height}px`;

        // Step 3: Land in inspector
        setTimeout(() => {
          targetElement.style.opacity = '1';
          clone.remove();

          const wrap = document.getElementById('panelIconWrap');
          if (wrap) {
            wrap.classList.remove('animate-pop');
            void wrap.offsetWidth;
            wrap.classList.add('animate-pop');
          }
        }, 350);
      }, 160);
    });
  }

  // Select item & display in left-side inspector panel
  function selectItem(item, btnElement) {
    selectedItem = item;

    // Highlight selected sprite
    document.querySelectorAll('.item-sprite').forEach(s => s.classList.remove('selected'));
    if (btnElement) {
      btnElement.classList.add('selected');
    }

    // Populate left side panel
    panelIcon.src = item.local_image;
    panelIcon.onerror = () => {
      if (panelIcon.src !== item.image_url) panelIcon.src = item.image_url;
    };
    panelIcon.alt = item.name;

    panelId.textContent = `#${String(item.game_id).padStart(3, '0')}`;
    panelType.textContent = item.type;
    panelType.className = `tag type-tag ${item.type === 'Activated' ? 'active' : ''}`;

    const qClass = item.quality !== null ? `q${item.quality}` : 'q0';
    panelQuality.textContent = item.quality !== null ? qualityNames[item.quality] || `Quality ${item.quality}` : 'Quality -';
    panelQuality.className = `tag quality-tag ${qClass}`;

    // DLC: Only show DLC information if the item requires a specific DLC
    const dlc = getItemDlc(item);
    if (dlc.requiresDlc) {
      if (panelDlcTag) {
        panelDlcTag.textContent = dlc.name;
        panelDlcTag.className = `tag dlc-tag dlc-${dlc.key}`;
        panelDlcTag.style.display = 'inline-block';
      }
      if (panelDlcNotice && panelDlcText) {
        panelDlcNotice.className = `panel-dlc-notice dlc-${dlc.key}`;
        panelDlcText.textContent = dlc.desc;
        panelDlcNotice.style.display = 'inline-flex';
      }
    } else {
      // Base game: do not mention DLC on the left
      if (panelDlcTag) {
        panelDlcTag.style.display = 'none';
      }
      if (panelDlcNotice) {
        panelDlcNotice.style.display = 'none';
      }
    }

    const iconWrap = document.getElementById('panelIconWrap');
    if (iconWrap) {
      iconWrap.className = `panel-icon-wrap ${qClass}`;
    }

    panelName.textContent = item.name;
    panelQuote.textContent = item.quote ? `"${item.quote}"` : '';
    panelDesc.textContent = item.description || 'No description available.';

    const isDefault = item.is_unlocked_by_default === 1;
    if (isDefault) {
      if (panelUnlockBlock) panelUnlockBlock.style.display = 'none';
    } else {
      if (panelUnlockBlock) panelUnlockBlock.style.display = 'block';
      panelUnlock.textContent = item.unlock_condition;
    }

    // Show content, hide placeholder, trigger reanimation of cards
    sidePlaceholder.style.display = 'none';
    sideContent.style.display = 'flex';
    sideContent.classList.remove('reanimate');
    void sideContent.offsetWidth;
    sideContent.classList.add('reanimate');

    // Scroll left panel to top
    document.getElementById('sidePanel').scrollTop = 0;

    // Trigger hover-then-fly animation if button was clicked
    if (btnElement) {
      triggerFlyAnimation(btnElement, panelIcon, item);
    } else {
      panelIcon.style.opacity = '1';
      if (iconWrap) {
        iconWrap.classList.remove('animate-pop');
        void iconWrap.offsetWidth;
        iconWrap.classList.add('animate-pop');
      }
    }
  }

  function deselectItem() {
    selectedItem = null;
    document.querySelectorAll('.item-sprite').forEach(s => s.classList.remove('selected'));
    sideContent.style.display = 'none';
    sidePlaceholder.style.display = 'flex';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
