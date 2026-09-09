(() => {
  const SEPARATOR = '\r\n\r\n<########################################################################################################>\r\n\r\n';

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
      name.title = 'Double-click to rename';

      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startRename(name, i);
      });

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

  function startRename(nameEl, index) {
    nameEl.contentEditable = 'true';
    nameEl.focus();
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finish = () => {
      nameEl.contentEditable = 'false';
      const newName = nameEl.textContent.trim() || `Tab ${index + 1}`;
      tabs[index].name = newName;
      nameEl.textContent = newName;
      scheduleSave();
      nameEl.removeEventListener('blur', finish);
      nameEl.removeEventListener('keydown', onKey);
    };

    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nameEl.blur();
      } else if (e.key === 'Escape') {
        nameEl.textContent = tabs[index].name;
        nameEl.blur();
      }
    };

    nameEl.addEventListener('blur', finish);
    nameEl.addEventListener('keydown', onKey);
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
    const n = tabs.length + 1;
    tabs.push({ name: `Tab ${n}`, notes: '' });
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

  async function askCloseAction(message) {
    return window.scratchPad.confirmClose(message);
  }

  async function closeTab(index) {
    // Keep current textarea in sync before asking
    tabs[activeIndex].notes = notesEl.value;
    const action = await askCloseAction('Do you want to save your notes before closing this tab?');
    if (action === 'cancel') return;
    if (action === 'save') {
      const saved = await exportLikeSave();
      if (!saved) return;
    }

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
      tabs.push({
        name: `Imported ${importCount}`,
        notes: chunk.replace(/\r\n/g, '\n'),
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
    scheduleSave();
  });

  // Window close confirmation
  window.scratchPad.onAppCloseRequest(async () => {
    tabs[activeIndex].notes = notesEl.value;
    clearTimeout(saveTimer);
    await window.scratchPad.saveData({ tabs, activeIndex });
    const action = await askCloseAction('Do you want to save your notes before closing?');
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
      tabs = data.tabs.map((t) => ({
        name: t.name || 'Tab',
        notes: typeof t.notes === 'string' ? t.notes : '',
      }));
      activeIndex = Math.min(
        typeof data.activeIndex === 'number' ? data.activeIndex : 0,
        tabs.length - 1
      );
    } else {
      tabs = [{
        name: 'Tab 1',
        notes: 'Welcome to Scratch Pad.\n\nType notes here. Use + to add tabs. Import/Export to move notes between computers.',
      }];
      activeIndex = 0;
    }
    notesEl.value = tabs[activeIndex].notes;
    renderTabs();
  })();
})();
