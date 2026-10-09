(() => {
  const SEPARATOR = '\r\n\r\n<########################################################################################################>\r\n\r\n';

  // Same rule as the original extension: first line of the notes, or "New Tab".
  function tabNameFromNotes(notes) {
    const m = String(notes || '').match(/^(.*)/);
    return (m && m[0]) || 'New Tab';
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Font Awesome "times" and "plus" glyph paths (same icons as the extension)
  const ICON_CLOSE = { w: 352, h: 512, d: 'm242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28L75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256L9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z' };
  const ICON_PLUS = { w: 448, h: 512, d: 'M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z' };

  function makeIcon(icon) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${icon.w} ${icon.h}`);
    svg.setAttribute('width', `${(icon.w / icon.h).toFixed(3)}em`);
    svg.setAttribute('height', '1em');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', icon.d);
    svg.appendChild(path);
    return svg;
  }

  let tabs = [{ name: 'Tab 1', notes: '' }];
  let activeIndex = 0;
  let saveTimer = null;
  // Recently closed tabs for Ctrl+Shift+T (in memory, newest last)
  const closedTabs = [];
  const CLOSED_TABS_MAX = 20;

  const tabsEl = document.getElementById('tabs');
  const notesEl = document.getElementById('notes');
  const statusEl = document.getElementById('status');
  const modalOverlay = document.getElementById('modal-overlay');
  const toastEl = document.getElementById('toast');

  function showToast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', !!isError);
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add('hidden'), 4000);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    statusEl.textContent = 'Saving…';
    saveTimer = setTimeout(async () => {
      const result = await window.scratchPad.saveData({ tabs, activeIndex });
      statusEl.textContent = result.ok ? 'Saved' : 'Save failed';
      setTimeout(() => {
        if (statusEl.textContent === 'Saved') statusEl.textContent = '';
      }, 1500);
    }, 300);
  }

  let dragFromIndex = null;

  function clearDropMarkers() {
    tabsEl.querySelectorAll('.drop-before, .drop-after').forEach((n) => {
      n.classList.remove('drop-before', 'drop-after');
    });
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    tabs.forEach((tab, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (i === activeIndex ? ' active' : '');
      el.dataset.index = String(i);
      el.draggable = true;

      const wrapper = document.createElement('div');
      wrapper.className = 'tabs-wrapper';

      const name = document.createElement('div');
      name.className = 'tab-name';
      name.textContent = tab.name;
      name.title = tab.name;
      wrapper.appendChild(name);

      // Close icon only when there is more than one tab (as in the extension)
      if (tabs.length > 1) {
        const close = document.createElement('div');
        close.className = 'tab-icon';
        close.title = 'Close tab';
        close.appendChild(makeIcon(ICON_CLOSE));
        close.addEventListener('click', (e) => {
          e.stopPropagation();
          closeTab(i);
        });
        wrapper.appendChild(close);
      }

      el.appendChild(wrapper);
      el.addEventListener('click', () => switchTab(i));
      // Middle-click closes the tab; suppress autoscroll on middle mousedown
      el.addEventListener('mousedown', (e) => {
        if (e.button === 1) e.preventDefault();
      });
      el.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          closeTab(i);
        }
      });

      // Native HTML5 drag-to-reorder
      el.addEventListener('dragstart', (e) => {
        dragFromIndex = i;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      el.addEventListener('dragend', () => {
        dragFromIndex = null;
        el.classList.remove('dragging');
        clearDropMarkers();
      });
      el.addEventListener('dragover', (e) => {
        if (dragFromIndex === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = el.getBoundingClientRect();
        const after = e.clientX > rect.left + rect.width / 2;
        clearDropMarkers();
        if (i !== dragFromIndex) el.classList.add(after ? 'drop-after' : 'drop-before');
      });
      el.addEventListener('dragleave', () => {
        el.classList.remove('drop-before', 'drop-after');
      });
      el.addEventListener('drop', (e) => {
        if (dragFromIndex === null) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const after = e.clientX > rect.left + rect.width / 2;
        const from = dragFromIndex;
        dragFromIndex = null;
        clearDropMarkers();
        let to = after ? i + 1 : i;
        if (from < to) to -= 1;
        moveTab(from, to);
      });

      tabsEl.appendChild(el);
    });

    // Small "+" right after the last tab, so it flows with the wrapped rows
    const addContainer = document.createElement('div');
    addContainer.className = 'add-tab-container';
    const addBtn = document.createElement('div');
    addBtn.className = 'add-tab-btn';
    addBtn.id = 'btn-add-tab';
    addBtn.title = 'New Tab (F1)';
    addBtn.setAttribute('role', 'button');
    addBtn.appendChild(makeIcon(ICON_PLUS));
    addBtn.addEventListener('click', addTab);
    addContainer.appendChild(addBtn);
    tabsEl.appendChild(addContainer);

    // Tab or content may have changed: keep find results in sync
    refreshFind();
  }

  function moveTab(from, to) {
    if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return;
    tabs[activeIndex].notes = notesEl.value;
    const activeTab = tabs[activeIndex];
    const [moved] = tabs.splice(from, 1);
    tabs.splice(to, 0, moved);
    // Keep the same tab active, wherever it ended up
    activeIndex = tabs.indexOf(activeTab);
    renderTabs();
    scheduleSave();
    notesEl.focus();
  }

  function switchTab(index) {
    if (index === activeIndex) return;
    // Persist current notes before switching
    tabs[activeIndex].notes = notesEl.value;
    activeIndex = index;
    notesEl.value = tabs[activeIndex].notes;
    renderTabs();
    scheduleSave();
    notesEl.focus();
  }

  function addTab() {
    tabs[activeIndex].notes = notesEl.value;
    tabs.push({ name: tabNameFromNotes(''), notes: '' });
    activeIndex = tabs.length - 1;
    notesEl.value = '';
    renderTabs();
    scheduleSave();
    notesEl.focus();
  }

  async function exportLikeSave() {
    const content = buildExportContent();
    const result = await window.scratchPad.exportNotes(content);
    if (result.ok) {
      showToast(`Notes saved\n${result.path}`);
      return true;
    }
    showToast(`Save failed: ${result.error || 'unknown error'}`, true);
    return false;
  }

  async function askCloseAction(message, allowDiscard = true) {
    return window.scratchPad.confirmClose({ message, allowDiscard });
  }

  function closeTab(index) {
    // Instant close, no save prompt. Like the extension, the last tab can't be closed.
    if (tabs.length <= 1 || index < 0 || index >= tabs.length) return;
    tabs[activeIndex].notes = notesEl.value;
    const [closed] = tabs.splice(index, 1);
    closedTabs.push({ name: closed.name, notes: closed.notes, index });
    if (closedTabs.length > CLOSED_TABS_MAX) closedTabs.shift();
    if (index < activeIndex || activeIndex >= tabs.length) {
      activeIndex -= 1;
    }
    notesEl.value = tabs[activeIndex].notes;
    renderTabs();
    scheduleSave();
    notesEl.focus();
    showToast('Tab closed \u2014 Ctrl+Shift+T to undo');
  }

  function reopenClosedTab() {
    const entry = closedTabs.pop();
    if (!entry) {
      showToast('No closed tabs to reopen');
      return;
    }
    tabs[activeIndex].notes = notesEl.value;
    const index = Math.max(0, Math.min(entry.index, tabs.length));
    tabs.splice(index, 0, { name: tabNameFromNotes(entry.notes), notes: entry.notes });
    activeIndex = index;
    notesEl.value = entry.notes;
    renderTabs();
    scheduleSave();
    notesEl.focus();
  }

  function buildExportContent() {
    // Capture current textarea into active tab first
    tabs[activeIndex].notes = notesEl.value;
    const parts = tabs.map((t) => t.notes);
    // Join with separator; separator already has surrounding CRLF blanks
    return parts.join(SEPARATOR);
  }

  async function doExport() {
    const content = buildExportContent();
    const result = await window.scratchPad.exportNotes(content);
    if (result.ok) {
      showToast(`Notes exported successfully\n${result.path}`);
      modalOverlay.classList.add('hidden');
    } else {
      showToast(`Export failed: ${result.error || 'unknown error'}`, true);
    }
  }

  async function doImport() {
    const result = await window.scratchPad.importPickFile();
    if (result.canceled) return;
    if (!result.ok) {
      showToast(`Import failed: ${result.error || 'unknown error'}`, true);
      return;
    }
    const chunks = result.text.split(/<#+>/g).map((c) => c.trim()).filter((c) => c.length > 0);
    if (!chunks.length) {
      showToast('No notes found in file', true);
      return;
    }
    // Save current notes first
    tabs[activeIndex].notes = notesEl.value;
    let importCount = 0;
    chunks.forEach((chunk) => {
      importCount += 1;
      const notes = chunk.replace(/\r\n/g, '\n');
      tabs.push({
        name: tabNameFromNotes(notes),
        notes,
      });
    });
    activeIndex = tabs.length - 1;
    notesEl.value = tabs[activeIndex].notes;
    renderTabs();
    scheduleSave();
    showToast('Notes imported successfully');
    modalOverlay.classList.add('hidden');
  }

  // ---------- Find in notes ----------
  const findBar = document.getElementById('find-bar');
  const findInput = document.getElementById('find-input');
  const findCount = document.getElementById('find-count');
  const backdropEl = document.getElementById('notes-backdrop');
  const FIND_MAX_MATCHES = 10000;
  let findOpen = false;
  let findMatches = [];
  let findCurrent = -1;
  let findAnchor = 0;
  let findTabIndex = -1;

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function computeMatches() {
    findMatches = [];
    const q = findInput.value;
    if (!q) return;
    const re = new RegExp(escapeRegExp(q), 'gi');
    const text = notesEl.value;
    let m;
    while ((m = re.exec(text)) !== null && findMatches.length < FIND_MAX_MATCHES) {
      if (!m[0].length) { re.lastIndex += 1; continue; }
      findMatches.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  function syncBackdropGeometry() {
    // Leave room for the textarea's scrollbar so wrapping matches exactly
    backdropEl.style.right = `${Math.max(0, notesEl.offsetWidth - notesEl.clientWidth)}px`;
    backdropEl.scrollTop = notesEl.scrollTop;
  }

  function renderFind() {
    const q = findInput.value;
    if (!q) {
      findCount.textContent = '';
    } else if (!findMatches.length) {
      findCount.textContent = 'No results';
    } else {
      const more = findMatches.length >= FIND_MAX_MATCHES ? '+' : '';
      findCount.textContent = `${findCurrent + 1} of ${findMatches.length}${more}`;
    }
    findInput.classList.toggle('no-match', !!q && !findMatches.length);

    backdropEl.textContent = '';
    if (!findOpen || !q || !findMatches.length) return;
    const text = notesEl.value;
    const frag = document.createDocumentFragment();
    let pos = 0;
    findMatches.forEach((m, i) => {
      if (m.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.start)));
      const mark = document.createElement('mark');
      if (i === findCurrent) mark.className = 'current';
      mark.textContent = text.slice(m.start, m.end);
      frag.appendChild(mark);
      pos = m.end;
    });
    // Trailing space keeps a final empty line the same height as in the textarea
    frag.appendChild(document.createTextNode(`${text.slice(pos)} `));
    backdropEl.appendChild(frag);
    syncBackdropGeometry();
  }

  function scrollToCurrentMatch() {
    const mark = backdropEl.querySelector('mark.current');
    if (!mark) return;
    const top = mark.offsetTop;
    const view = notesEl.clientHeight;
    if (top < notesEl.scrollTop + 10 || top + mark.offsetHeight > notesEl.scrollTop + view - 10) {
      notesEl.scrollTop = Math.max(0, top - Math.round(view / 3));
    }
    backdropEl.scrollTop = notesEl.scrollTop;
  }

  function selectCurrentMatch() {
    const m = findMatches[findCurrent];
    if (!m) return;
    const keepScroll = notesEl.scrollTop;
    notesEl.setSelectionRange(m.start, m.end);
    notesEl.scrollTop = keepScroll;
    scrollToCurrentMatch();
  }

  // Re-run the search. anchor: text offset to start from (defaults to the current match).
  function refreshFind(anchor) {
    if (!findOpen) return;
    let from = anchor;
    if (from === undefined) {
      if (findTabIndex !== activeIndex) from = 0;
      else from = findMatches[findCurrent] ? findMatches[findCurrent].start : 0;
    }
    findTabIndex = activeIndex;
    computeMatches();
    if (!findMatches.length) {
      findCurrent = -1;
    } else {
      const idx = findMatches.findIndex((m) => m.start >= from);
      findCurrent = idx < 0 ? 0 : idx;
    }
    renderFind();
  }

  function stepFind(delta) {
    if (!findMatches.length) return;
    findCurrent = (findCurrent + delta + findMatches.length) % findMatches.length;
    renderFind();
    selectCurrentMatch();
  }

  function openFind() {
    const selected = notesEl.value.slice(notesEl.selectionStart, notesEl.selectionEnd);
    if (selected && !/[\r\n]/.test(selected) && selected.length <= 200) findInput.value = selected;
    findAnchor = Math.min(notesEl.selectionStart, notesEl.selectionEnd);
    findOpen = true;
    findTabIndex = activeIndex;
    findBar.classList.remove('hidden');
    syncBackdropGeometry();
    refreshFind(findAnchor);
    if (findMatches.length) scrollToCurrentMatch();
    findInput.focus();
    findInput.select();
  }

  function closeFind() {
    if (!findOpen) return;
    findOpen = false;
    findBar.classList.add('hidden');
    backdropEl.textContent = '';
    findMatches = [];
    findCurrent = -1;
    notesEl.focus();
  }

  findInput.addEventListener('input', () => {
    refreshFind(findAnchor);
    if (findMatches.length) {
      const keepScroll = notesEl.scrollTop;
      const m = findMatches[findCurrent];
      notesEl.setSelectionRange(m.start, m.end);
      notesEl.scrollTop = keepScroll;
      scrollToCurrentMatch();
    }
  });

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stepFind(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFind();
    }
  });

  document.getElementById('find-next').addEventListener('click', () => stepFind(1));
  document.getElementById('find-prev').addEventListener('click', () => stepFind(-1));
  document.getElementById('find-close').addEventListener('click', closeFind);

  notesEl.addEventListener('scroll', () => {
    if (findOpen) backdropEl.scrollTop = notesEl.scrollTop;
  });

  window.addEventListener('resize', () => {
    if (findOpen) syncBackdropGeometry();
  });

  // ---------- Notes font size ----------
  let fontMin = 10;
  let fontMax = 28;
  let fontDefault = 13;
  let fontSize = 13;
  let fontSaveTimer = null;
  const fontInput = document.getElementById('font-size');

  function applyFontSize(size) {
    notesEl.style.fontSize = `${size}px`;
    backdropEl.style.fontSize = `${size}px`;
    fontInput.value = String(size);
    if (findOpen) {
      renderFind();
      scrollToCurrentMatch();
    }
  }

  function setFontSize(size, persist = true) {
    let n = Math.round(Number(size));
    if (!Number.isFinite(n)) n = fontDefault;
    n = Math.min(fontMax, Math.max(fontMin, n));
    fontSize = n;
    applyFontSize(n);
    if (persist) {
      clearTimeout(fontSaveTimer);
      fontSaveTimer = setTimeout(() => {
        window.scratchPad.setFontSize(fontSize).catch(() => showToast('Could not save font size', true));
      }, 250);
    }
  }

  document.getElementById('btn-font-dec').addEventListener('click', () => setFontSize(fontSize - 1));
  document.getElementById('btn-font-inc').addEventListener('click', () => setFontSize(fontSize + 1));
  document.getElementById('btn-font-reset').addEventListener('click', () => setFontSize(fontDefault));
  fontInput.addEventListener('change', () => setFontSize(fontInput.value));

  // ---------- Keyboard shortcuts ----------
  window.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    // F1 = new tab (as in the extension)
    if (e.key === 'F1' && !ctrl && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      addTab();
      return;
    }
    if (ctrl && e.shiftKey && !e.altKey && e.code === 'KeyT') {
      e.preventDefault();
      reopenClosedTab();
      return;
    }
    if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyF') {
      e.preventDefault();
      openFind();
      return;
    }
    if (ctrl && !e.altKey) {
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault();
        setFontSize(fontSize + 1);
        return;
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        setFontSize(fontSize - 1);
        return;
      }
      if ((e.code === 'Digit0' || e.code === 'Numpad0') && !e.shiftKey) {
        e.preventDefault();
        setFontSize(fontDefault);
        return;
      }
    }
    if (e.key === 'Escape' && findOpen && (e.target === notesEl || findBar.contains(e.target))) {
      e.preventDefault();
      closeFind();
    }
  });

  function insertSeparator() {
    const block = '\n\n------------------------------------------\n\n';
    const start = notesEl.selectionStart;
    const end = notesEl.selectionEnd;
    const value = notesEl.value;
    notesEl.value = value.slice(0, start) + block + value.slice(end);
    const caret = start + block.length;
    notesEl.selectionStart = notesEl.selectionEnd = caret;
    tabs[activeIndex].notes = notesEl.value;
    scheduleSave();
    notesEl.focus();
    refreshFind();
  }

  document.getElementById('btn-separator').addEventListener('click', insertSeparator);

  document.getElementById('btn-import-export').addEventListener('click', () => {
    modalOverlay.classList.remove('hidden');
  });

  document.getElementById('btn-modal-close').addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.add('hidden');
  });

  document.getElementById('btn-export').addEventListener('click', doExport);
  document.getElementById('btn-import').addEventListener('click', doImport);

  notesEl.addEventListener('input', () => {
    tabs[activeIndex].notes = notesEl.value;
    const newName = tabNameFromNotes(notesEl.value);
    if (tabs[activeIndex].name !== newName) {
      tabs[activeIndex].name = newName;
      const label = tabsEl.querySelector('.tab.active .tab-name');
      if (label) {
        label.textContent = newName;
        label.title = newName;
      } else {
        renderTabs();
      }
    }
    scheduleSave();
    refreshFind();
  });

  // ---------- Settings ----------
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsFolderEl = document.getElementById('settings-folder');
  const backupIntervalEl = document.getElementById('backup-interval');
  const backupKeepEl = document.getElementById('backup-keep');
  const backupFolderEl = document.getElementById('backup-folder');
  const backupLastEl = document.getElementById('backup-last');

  function formatTime(iso) {
    if (!iso) return 'never';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'never';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function setLastBackup(iso) {
    backupLastEl.textContent = `Last backup: ${formatTime(iso)}`;
  }

  function populateSettings(st) {
    if (!st) return;
    settingsFolderEl.textContent = st.exportFolder || '';
    if (typeof st.fontMin === 'number') fontMin = st.fontMin;
    if (typeof st.fontMax === 'number') fontMax = st.fontMax;
    if (typeof st.fontDefault === 'number') fontDefault = st.fontDefault;
    fontInput.min = String(fontMin);
    fontInput.max = String(fontMax);
    if (typeof st.fontSize === 'number' && st.fontSize !== fontSize) setFontSize(st.fontSize, false);
    else fontInput.value = String(fontSize);
    backupIntervalEl.value = st.backupInterval || '1d';
    backupKeepEl.value = String(st.backupKeep || 30);
    backupFolderEl.textContent = st.backupFolder || '';
    setLastBackup(st.lastBackupAt);
  }

  async function refreshSettings() {
    try {
      populateSettings(await window.scratchPad.getSettings());
    } catch (e) {
      showToast('Could not load settings', true);
    }
  }

  function currentState() {
    tabs[activeIndex].notes = notesEl.value;
    return { tabs, activeIndex };
  }

  document.getElementById('btn-settings').addEventListener('click', async () => {
    await refreshSettings();
    settingsOverlay.classList.remove('hidden');
  });

  document.getElementById('btn-settings-close').addEventListener('click', () => {
    settingsOverlay.classList.add('hidden');
  });

  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
  });

  document.getElementById('btn-choose-folder').addEventListener('click', async () => {
    const result = await window.scratchPad.pickExportFolder();
    if (result.ok && result.settings) {
      settingsFolderEl.textContent = result.settings.exportFolder;
      showToast('Save folder updated');
    }
  });

  document.getElementById('btn-reset-folder').addEventListener('click', async () => {
    const result = await window.scratchPad.resetExportFolder();
    if (result.ok && result.settings) {
      settingsFolderEl.textContent = result.settings.exportFolder;
      showToast('Save folder reset to Downloads');
    }
  });

  backupIntervalEl.addEventListener('change', async () => {
    try {
      const result = await window.scratchPad.setBackupOptions({ interval: backupIntervalEl.value });
      populateSettings(result.settings);
      showToast(backupIntervalEl.value === 'off' ? 'Auto backup turned off' : 'Auto backup updated');
    } catch (e) {
      showToast('Could not save backup setting', true);
    }
  });

  backupKeepEl.addEventListener('change', async () => {
    let n = Math.round(Number(backupKeepEl.value));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 999) n = 999;
    backupKeepEl.value = String(n);
    try {
      const result = await window.scratchPad.setBackupOptions({ keep: n });
      populateSettings(result.settings);
    } catch (e) {
      showToast('Could not save backup setting', true);
    }
  });

  document.getElementById('btn-backup-folder').addEventListener('click', async () => {
    try {
      const result = await window.scratchPad.pickBackupFolder();
      if (result.ok && result.settings) {
        populateSettings(result.settings);
        showToast('Backup folder updated');
      }
    } catch (e) {
      showToast('Could not change backup folder', true);
    }
  });

  document.getElementById('btn-backup-folder-reset').addEventListener('click', async () => {
    try {
      const result = await window.scratchPad.resetBackupFolder();
      if (result.ok && result.settings) {
        populateSettings(result.settings);
        showToast('Backup folder reset to Documents\\Scratch Pad Backups');
      }
    } catch (e) {
      showToast('Could not reset backup folder', true);
    }
  });

  document.getElementById('btn-backup-open').addEventListener('click', async () => {
    try {
      const result = await window.scratchPad.openBackupFolder();
      if (!result.ok) showToast(`Could not open folder: ${result.error || 'unknown error'}`, true);
    } catch (e) {
      showToast('Could not open backup folder', true);
    }
  });

  document.getElementById('btn-backup-now').addEventListener('click', async () => {
    try {
      const result = await window.scratchPad.backupNow(currentState());
      if (result.ok && result.path) {
        showToast(`Backup saved\n${result.path}`);
      } else if (result.ok) {
        showToast('Nothing to back up');
      } else {
        showToast(`Backup failed: ${result.error || 'unknown error'}`, true);
      }
      populateSettings(result.settings);
    } catch (e) {
      showToast('Backup failed', true);
    }
  });

  document.getElementById('btn-backup-restore').addEventListener('click', async () => {
    try {
      clearTimeout(saveTimer);
      const result = await window.scratchPad.restoreBackup(currentState());
      if (result.canceled) return;
      if (!result.ok) {
        showToast(`Restore failed: ${result.error || 'unknown error'}`, true);
        return;
      }
      const restored = result.data.tabs.map((t) => ({ name: tabNameFromNotes(t.notes), notes: t.notes }));
      if (!restored.length) {
        showToast('Restore failed: backup has no tabs', true);
        return;
      }
      tabs = restored;
      activeIndex = Math.min(Math.max(0, result.data.activeIndex || 0), tabs.length - 1);
      notesEl.value = tabs[activeIndex].notes;
      renderTabs();
      await window.scratchPad.saveData({ tabs, activeIndex });
      populateSettings(result.settings);
      showToast(`Restored ${tabs.length} tab(s) from backup.\nYour previous tabs were backed up first.`);
    } catch (e) {
      showToast('Restore failed', true);
    }
  });

  window.scratchPad.onBackupStatus((status) => {
    if (!status) return;
    if (status.lastBackupAt) setLastBackup(status.lastBackupAt);
    if (!status.ok) showToast(`Auto backup failed: ${status.error || 'unknown error'}`, true);
  });

  // Window close confirmation
  window.scratchPad.onAppCloseRequest(async () => {
    tabs[activeIndex].notes = notesEl.value;
    clearTimeout(saveTimer);
    await window.scratchPad.saveData({ tabs, activeIndex });
    const action = await askCloseAction('Do you want to save your notes before closing?', true);
    if (action === 'cancel') {
      window.scratchPad.respondAppClose(false);
      return;
    }
    if (action === 'save') {
      const saved = await exportLikeSave();
      if (!saved) {
        window.scratchPad.respondAppClose(false);
        return;
      }
    }
    window.scratchPad.respondAppClose(true);
  });

  // Init
  (async () => {
    await refreshSettings();

    const data = await window.scratchPad.loadData();
    if (data && Array.isArray(data.tabs) && data.tabs.length) {
      tabs = data.tabs.map((t, i) => {
        const notes = typeof t.notes === 'string' ? t.notes : '';
        return { name: tabNameFromNotes(notes), notes };
      });
      activeIndex = Math.min(
        typeof data.activeIndex === 'number' ? data.activeIndex : 0,
        tabs.length - 1
      );
    } else {
      tabs = [{
        notes: 'Welcome to Scratch Pad Portable.\n\nType notes here. The tab title is the first line of your notes. Use + or F1 to add tabs; drag tabs to reorder; middle-click a tab to close it.\n\nShortcuts:\n  F1  New tab\n  Ctrl+Shift+T  Reopen closed tab\n  Ctrl+F  Find in notes\n  Ctrl+= / Ctrl+-  Bigger / smaller text (Ctrl+0 resets)\n\nRight-click for spelling suggestions. Settings has the save folder, font size and automatic backups (Documents\\Scratch Pad Backups by default). Import/Export moves notes between computers.',
      }];
      tabs[0].name = tabNameFromNotes(tabs[0].notes);
      activeIndex = 0;
    }
    notesEl.value = tabs[activeIndex].notes;
    renderTabs();
  })();
})();
