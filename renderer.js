(() => {
  const SEPARATOR = '\r\n\r\n<########################################################################################################>\r\n\r\n';

  function tabNameFromNotes(notes, index) {
    const first = String(notes || '').split(/\r?\n/, 1)[0].trim();
    if (!first) return `Tab ${index + 1}`;
    return first.length > 48 ? `${first.slice(0, 48)}…` : first;
  }

  function syncTabNameFromNotes(index) {
    tabs[index].name = tabNameFromNotes(tabs[index].notes, index);
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

  function renderTabs() {
    tabsEl.innerHTML = '';
    tabs.forEach((tab, i) => {
      const el = document.createElement('div');
      el.className = 'tab' + (i === activeIndex ? ' active' : '');
      el.dataset.index = String(i);

      const name = document.createElement('span');
      name.className = 'tab-name';
      name.textContent = tab.name;
      name.title = tab.name;

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.title = 'Close tab';
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(i);
      });

      el.appendChild(name);
      el.appendChild(close);
      el.addEventListener('click', () => switchTab(i));
      tabsEl.appendChild(el);
    });
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
    tabs.push({ name: tabNameFromNotes('', tabs.length), notes: '' });
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

  async function closeTab(index) {
    // Sync current textarea, then close with no prompt
    tabs[activeIndex].notes = notesEl.value;

    if (tabs.length === 1) {
      tabs[0] = { name: 'Tab 1', notes: '' };
      activeIndex = 0;
      notesEl.value = '';
      renderTabs();
      scheduleSave();
      return;
    }
    tabs.splice(index, 1);
    if (activeIndex >= tabs.length) {
      activeIndex = tabs.length - 1;
    } else if (index < activeIndex) {
      activeIndex -= 1;
    } else if (index === activeIndex) {
      // stay at same index (now next tab) or clamp
      if (activeIndex >= tabs.length) activeIndex = tabs.length - 1;
    }
    notesEl.value = tabs[activeIndex].notes;
    renderTabs();
    scheduleSave();
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
        name: tabNameFromNotes(notes, tabs.length),
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

  // Event bindings
  document.getElementById('btn-add-tab').addEventListener('click', addTab);

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
    const newName = tabNameFromNotes(notesEl.value, activeIndex);
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
        return { name: tabNameFromNotes(notes, i), notes };
      });
      activeIndex = Math.min(
        typeof data.activeIndex === 'number' ? data.activeIndex : 0,
        tabs.length - 1
      );
    } else {
      tabs = [{
        notes: 'Welcome to Scratch Pad Portable.\n\nType notes here. The tab title is the first line of your notes. Use + to add tabs. Import/Export to move notes between computers.',
      }];
      tabs[0].name = tabNameFromNotes(tabs[0].notes, 0);
      activeIndex = 0;
    }
    notesEl.value = tabs[activeIndex].notes;
    renderTabs();
  })();
})();
