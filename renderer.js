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
    tabs.splice(index, 1);
    if (index < activeIndex || activeIndex >= tabs.length) {
      activeIndex -= 1;
    }
    notesEl.value = tabs[activeIndex].notes;
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

  // Keyboard: F1 = new tab (as in the extension)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      addTab();
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
  });

  // Settings
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsFolderEl = document.getElementById('settings-folder');

  async function refreshSettingsFolder() {
    const settings = await window.scratchPad.getSettings();
    settingsFolderEl.textContent = settings.exportFolder || '';
  }

  document.getElementById('btn-settings').addEventListener('click', async () => {
    await refreshSettingsFolder();
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
        notes: 'Welcome to Scratch Pad Portable.\n\nType notes here. The tab title is the first line of your notes. Use + or F1 to add tabs; drag tabs to reorder; middle-click a tab to close it. Import/Export to move notes between computers.',
      }];
      tabs[0].name = tabNameFromNotes(tabs[0].notes);
      activeIndex = 0;
    }
    notesEl.value = tabs[activeIndex].notes;
    renderTabs();
  })();
})();
