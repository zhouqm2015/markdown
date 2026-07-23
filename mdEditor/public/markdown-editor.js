    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    const previewSource = document.getElementById('preview-source');
    const filenameInput = document.getElementById('filename');
    const wordCount = document.getElementById('word-count');
    const saveHint = document.getElementById('save-hint');
    const toast = document.getElementById('toast');

    const STORAGE_KEY = 'md_editor_content';
    const FILENAME_KEY = 'md_editor_filename';
    const THEME_KEY = 'md_editor_theme';
    const HELP_SHOWN_KEY = 'md_editor_help_shown';
    const RATIO_KEY = 'md_editor_ratio';
    const EDITOR_COLLAPSED_KEY = 'md_editor_editor_collapsed';
    const PREVIEW_COLLAPSED_KEY = 'md_editor_preview_collapsed';
    const PREVIEW_MODE_KEY = 'md_editor_preview_mode';
    const LANG_KEY = 'md_editor_language';
    const STORAGE_BACKEND_KEY = 'md_editor_storage_backend';
    const IDB_NAME = 'md-editor';
    const IDB_VERSION = 1;
    const IDB_STORE = 'kv';
    const IDB_SIZE_THRESHOLD = 512 * 1024; // 超过 512KB 直接使用 IndexedDB
    const PREVIEW_DEBOUNCE_MS = 150;
    const MERMAID_DEBOUNCE_MS = 400;
    const LAZY_SCRIPTS = {
      mermaid: 'public/vendor/mermaid-10.9.3/mermaid.min.js',
      domtoimage: 'public/vendor/dom-to-image-more-3.5.0/dom-to-image-more.min.js'
    };

    let previewMode = 'preview';
    let currentLang = 'zh-CN';
    let previewTimer = null;
    let mermaidTimer = null;
    let mermaidReady = false;
    const scriptLoaders = {};
    let idbPromise = null;
    let usingIndexedDB = false;

    function safeLocalStorageSet(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
          if (key !== STORAGE_KEY) showToast(t('toastStorageQuotaExceeded'));
          return false;
        }
        throw e;
      }
    }

    function openIDB() {
      if (!window.indexedDB) return Promise.reject(new Error('IndexedDB not supported'));
      if (!idbPromise) {
        idbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open(IDB_NAME, IDB_VERSION);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
              db.createObjectStore(IDB_STORE);
            }
          };
        });
      }
      return idbPromise;
    }

    function idbGet(key) {
      return openIDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      }));
    }

    function idbSet(key, value) {
      return openIDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(IDB_STORE).put(value, key);
      }));
    }

    async function loadContent() {
      const backend = localStorage.getItem(STORAGE_BACKEND_KEY) || 'localStorage';
      if (backend === 'indexedDB' && window.indexedDB) {
        usingIndexedDB = true;
        const content = await idbGet(STORAGE_KEY);
        if (content !== null) return content;
      }
      const local = localStorage.getItem(STORAGE_KEY);
      if (local !== null) return local;
      if (window.indexedDB) {
        const idbContent = await idbGet(STORAGE_KEY);
        if (idbContent !== null) {
          usingIndexedDB = true;
          localStorage.setItem(STORAGE_BACKEND_KEY, 'indexedDB');
          return idbContent;
        }
      }
      return null;
    }

    async function persistContent(content) {
      const prevBackend = localStorage.getItem(STORAGE_BACKEND_KEY) || 'localStorage';
      const preferIDB = prevBackend === 'indexedDB' || content.length > IDB_SIZE_THRESHOLD;

      if (preferIDB && window.indexedDB) {
        try {
          await idbSet(STORAGE_KEY, content);
          localStorage.setItem(STORAGE_BACKEND_KEY, 'indexedDB');
          usingIndexedDB = true;
          if (prevBackend !== 'indexedDB') {
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
            showToast(t('toastStorageIndexedDB'));
          }
          updateStatusBar();
          return true;
        } catch (e) {
          showToast(t('toastStorageQuotaExceeded'));
          return false;
        }
      }

      try {
        localStorage.setItem(STORAGE_KEY, content);
        localStorage.setItem(STORAGE_BACKEND_KEY, 'localStorage');
        usingIndexedDB = false;
        updateStatusBar();
        return true;
      } catch (e) {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22) && window.indexedDB) {
          try {
            await idbSet(STORAGE_KEY, content);
            localStorage.setItem(STORAGE_BACKEND_KEY, 'indexedDB');
            usingIndexedDB = true;
            try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
            showToast(t('toastStorageIndexedDB'));
            updateStatusBar();
            return true;
          } catch (e2) {
            showToast(t('toastStorageQuotaExceeded'));
            return false;
          }
        }
        if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
          showToast(t('toastStorageQuotaExceeded'));
          return false;
        }
        throw e;
      }
    }

    function sanitizeHtml(html) {
      if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
          ADD_ATTR: ['target', 'rel', 'class', 'id', 'data-task'],
          ADD_TAGS: ['details', 'summary']
        });
      }
      return html;
    }

    function loadScript(src) {
      if (scriptLoaders[src]) return scriptLoaders[src];
      scriptLoaders[src] = new Promise((resolve, reject) => {
        if (document.querySelector('script[data-src="' + src + '"]')) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.dataset.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load ' + src));
        document.head.appendChild(script);
      });
      return scriptLoaders[src];
    }

    function initMermaidTheme(theme) {
      if (typeof mermaid === 'undefined') return;
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'default'
      });
      mermaidReady = true;
    }

    async function ensureMermaid() {
      if (typeof mermaid !== 'undefined') return;
      await loadScript(LAZY_SCRIPTS.mermaid);
      initMermaidTheme(document.body.getAttribute('data-theme') || 'light');
    }

    async function ensureDomToImage() {
      if (typeof domtoimage !== 'undefined') return;
      await loadScript(LAZY_SCRIPTS.domtoimage);
    }

    function t(key, ...args) {
      const dict = i18n[currentLang] || i18n['zh-CN'];
      let str = dict[key];
      if (str === undefined) str = i18n['zh-CN'][key] || key;
      return args.reduce((s, arg, i) => s.replace(new RegExp('\\{' + i + '\\}', 'g'), String(arg)), str);
    }

    function setLanguage(lang) {
      if (!i18n[lang]) lang = 'zh-CN';
      currentLang = lang;
      safeLocalStorageSet(LANG_KEY, lang);
      applyLanguage();
    }

    function applyLanguage() {
      document.documentElement.lang = currentLang;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        el.textContent = t(key);
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.dataset.i18nTitle;
        el.title = t(key);
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        el.placeholder = t(key);
      });
      document.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.dataset.i18nAlt;
        el.alt = t(key);
      });

      const helpBody = document.getElementById('help-body');
      if (helpBody && i18n[currentLang] && i18n[currentLang].helpHtml) {
        helpBody.innerHTML = i18n[currentLang].helpHtml;
      }

      updateCollapseBtnLabels();
      updateViewMenuLabel();
      updateStatusBar();
      updateCount();
    }

    function updateCollapseBtnLabels() {
      const editorBtn = document.getElementById('editor-collapse-btn');
      const previewBtn = document.getElementById('preview-collapse-btn');
      if (editorBtn) editorBtn.title = editorCollapsed ? t('expandEditor') : t('collapseEditor');
      if (previewBtn) previewBtn.title = previewCollapsed ? t('expandPreview') : t('collapsePreview');
    }

    function updateStatusBar() {
      const statusLeft = document.getElementById('status-left');
      const statusRight = document.getElementById('status-right');
      const saveHintEl = document.getElementById('save-hint');
      if (statusLeft) statusLeft.textContent = usingIndexedDB ? t('autosaveIndexedDB') : t('autosaveEnabled');
      if (statusRight) statusRight.textContent = t('statusShortcuts');
      if (saveHintEl) saveHintEl.textContent = '✓ ' + t('saved');
    }

    function toggleLangMenu() {
      document.getElementById('lang-menu').classList.toggle('show');
    }

    function closeLangMenu() {
      document.getElementById('lang-menu').classList.remove('show');
    }
    let fetchedHtml = '';
    let editorCollapsed = false;
    let previewCollapsed = false;
    let editorRatio = 0.5;
    let isResizing = false;
    let resizeRect = null;

    if (typeof marked !== 'undefined') {
      marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
      });
    }

    function schedulePreviewUpdate() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(updatePreview, PREVIEW_DEBOUNCE_MS);
    }

    function scheduleMermaidRender() {
      clearTimeout(mermaidTimer);
      mermaidTimer = setTimeout(() => { renderMermaidBlocksAsync(); }, MERMAID_DEBOUNCE_MS);
    }

    const LAYOUT_MODE_KEY = 'md_editor_layout_mode';
    const PAGE_FULLSCREEN_KEY = 'md_editor_page_fullscreen';
    const MAX_HISTORY = 100;
    let historyStack = [];
    let historyIndex = -1;
    let lastHistoryText = null;
    let historyTimer = null;

    function togglePane(pane) {
      if (pane === 'editor') {
        if (!editorCollapsed && previewCollapsed) return;
        editorCollapsed = !editorCollapsed;
      } else {
        if (!previewCollapsed && editorCollapsed) return;
        previewCollapsed = !previewCollapsed;
      }
      applyPaneStates();
      localStorage.setItem(EDITOR_COLLAPSED_KEY, editorCollapsed);
      localStorage.setItem(PREVIEW_COLLAPSED_KEY, previewCollapsed);
    }

    function applyPaneStates() {
      const editorPane = document.querySelector('.editor-pane');
      const previewPane = document.querySelector('.preview-pane');
      const resizer = document.getElementById('resizer');
      editorPane.classList.toggle('collapsed', editorCollapsed);
      previewPane.classList.toggle('collapsed', previewCollapsed);
      resizer.classList.toggle('hidden', editorCollapsed || previewCollapsed);

      const editorBtn = editorPane.querySelector('.collapse-btn');
      const previewBtn = previewPane.querySelector('.collapse-btn');

      const chevronLeft = '<svg class="icon icon-sm"><use href="#icon-chevron-left"></use></svg>';
      const chevronRight = '<svg class="icon icon-sm"><use href="#icon-chevron-right"></use></svg>';
      editorBtn.innerHTML = editorCollapsed ? chevronRight : chevronLeft;
      previewBtn.innerHTML = previewCollapsed ? chevronLeft : chevronRight;

      updateCollapseBtnLabels();

      applySplit();
    }

    function applySplit() {
      const editorPane = document.querySelector('.editor-pane');
      const previewPane = document.querySelector('.preview-pane');
      if (editorCollapsed || previewCollapsed) {
        editorPane.style.flex = '';
        previewPane.style.flex = '';
      } else {
        editorPane.style.flex = `0 0 ${editorRatio * 100}%`;
        previewPane.style.flex = '1 1 0';
      }
    }

    function startResize(e) {
      isResizing = true;
      resizeRect = document.querySelector('.main').getBoundingClientRect();
      document.body.classList.add('resizing');
      const resizer = document.getElementById('resizer');
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    }

    function stopResize() {
      if (!isResizing) return;
      isResizing = false;
      resizeRect = null;
      document.body.classList.remove('resizing');
      const resizer = document.getElementById('resizer');
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    function onResizeMove(e) {
      if (!isResizing || !resizeRect) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let ratio = (clientX - resizeRect.left) / resizeRect.width;
      ratio = Math.max(0.15, Math.min(0.85, ratio));
      editorRatio = ratio;
      localStorage.setItem(RATIO_KEY, editorRatio);
      applySplit();
    }

    const resizer = document.getElementById('resizer');
    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('touchmove', onResizeMove, { passive: false });
    window.addEventListener('mouseup', stopResize);
    window.addEventListener('touchend', stopResize);

    // 同步滚动
    let isSyncingScroll = false;

    function syncScroll(source, target) {
      if (isSyncingScroll) return;
      const sourceHeight = source.scrollHeight - source.clientHeight;
      const targetHeight = target.scrollHeight - target.clientHeight;
      if (sourceHeight <= 0 || targetHeight <= 0) return;
      isSyncingScroll = true;
      const ratio = source.scrollTop / sourceHeight;
      target.scrollTop = ratio * targetHeight;
      isSyncingScroll = false;
    }

    editor.addEventListener('scroll', () => syncScroll(editor, preview));
    preview.addEventListener('scroll', () => syncScroll(preview, editor));

    // 初始化：恢复内容、文件名、主题
    async function init() {
      const savedLang = localStorage.getItem(LANG_KEY);
      if (savedLang && i18n[savedLang]) currentLang = savedLang;

      if (localStorage.getItem(STORAGE_BACKEND_KEY) === 'indexedDB') {
        usingIndexedDB = true;
      }

      let saved = null;
      try {
        saved = await loadContent();
      } catch (e) {
        console.error('Failed to load content:', e);
        saved = localStorage.getItem(STORAGE_KEY);
      }
      if (saved !== null) {
        editor.value = saved;
      } else {
        editor.value = i18n[currentLang].welcomeDoc;
      }
      filenameInput.value = localStorage.getItem(FILENAME_KEY) || t('filenameDefault');
      const theme = localStorage.getItem(THEME_KEY) || 'light';
      document.body.setAttribute('data-theme', theme);

      const savedRatio = localStorage.getItem(RATIO_KEY);
      if (savedRatio !== null) {
        const parsed = parseFloat(savedRatio);
        if (!isNaN(parsed)) editorRatio = parsed;
      }
      editorCollapsed = localStorage.getItem(EDITOR_COLLAPSED_KEY) === 'true';
      previewCollapsed = localStorage.getItem(PREVIEW_COLLAPSED_KEY) === 'true';
      const savedPreviewMode = localStorage.getItem(PREVIEW_MODE_KEY);
      if (savedPreviewMode === 'preview' || savedPreviewMode === 'source') {
        previewMode = savedPreviewMode;
      }

      updatePreview();
      updateCount();
      applyPaneStates();
      setPreviewMode(previewMode);

      // 初始化历史记录
      historyStack = [editor.value];
      historyIndex = 0;
      lastHistoryText = editor.value;

      // 默认打开为编辑 + 预览双栏；仅恢复用户明确的“仅编辑”或“双栏”状态
      const savedLayoutMode = localStorage.getItem(LAYOUT_MODE_KEY);
      if (savedLayoutMode === 'edit' || savedLayoutMode === 'both') {
        setLayoutMode(savedLayoutMode);
      } else {
        setLayoutMode('both');
      }
      updateViewMenuLabel();

      // 恢复页面全屏
      if (localStorage.getItem(PAGE_FULLSCREEN_KEY) === 'true') {
        document.querySelector('.app').classList.add('page-fullscreen');
        document.body.classList.add('page-fullscreen-active');
      }

      if (!localStorage.getItem(HELP_SHOWN_KEY)) {
        openHelp();
      }
      applyLanguage();
    }

    // 渲染预览
    function updatePreview() {
      let text = editor.value;
      let placeholders = [];

      if (typeof renderMathInElement !== 'undefined') {
        const protected = protectMath(text);
        text = protected.text;
        placeholders = protected.placeholders;
      }

      let html = '';
      if (typeof marked !== 'undefined') {
        html = marked.parse(text);
      } else {
        html = '<pre style="white-space:pre-wrap">' + escapeHtml(text) + '</pre>';
      }

      if (placeholders.length) {
        html = restoreMath(html, placeholders);
      }

      html = sanitizeHtml(html);
      preview.innerHTML = '<div class="markdown-body">' + html + '</div>';
      styleTaskLists();

      if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(preview, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      }

      scheduleMermaidRender();
    }

    function protectMath(text) {
      const placeholders = [];
      let counter = 0;

      const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
      const out = parts.map(part => {
        if (part.startsWith('```') || part.startsWith('`')) return part;

        part = part.replace(/\$\$[\s\S]*?\$\$/g, m => store(m));
        part = part.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (m, p1) => p1 + store(m.slice(p1.length)));

        return part;
      }).join('');

      return { text: out, placeholders };

      function store(match) {
        const key = '<!--MATH' + counter++ + '-->';
        placeholders.push({ key, value: match });
        return key;
      }
    }

    function restoreMath(html, placeholders) {
      placeholders.forEach(({ key, value }) => {
        html = html.split(key).join(value);
      });
      return html;
    }

    function styleTaskLists() {
      preview.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const li = cb.closest('li');
        if (!li) return;
        li.classList.add('task-item');
        const ul = li.closest('ul, ol');
        if (ul && ul.tagName === 'UL') ul.classList.add('task-list');
      });
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // 统计字数
    function updateCount() {
      const text = editor.value;
      const count = text.replace(/\s/g, '').length;
      wordCount.textContent = t('wordCount', count);
    }

    // 切换预览/源码模式
    function setPreviewMode(mode) {
      previewMode = mode;
      localStorage.setItem(PREVIEW_MODE_KEY, previewMode);
      document.querySelectorAll('.preview-toggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
      if (mode === 'preview') {
        editor.value = previewSource.value;
        preview.style.display = '';
        previewSource.style.display = 'none';
        updatePreview();
        updateCount();
        autoSave();
      } else {
        previewSource.value = editor.value;
        preview.style.display = 'none';
        previewSource.style.display = 'block';
        previewSource.focus();
      }
    }

    // 自动保存
    let saveTimer;
    function autoSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const saved = await persistContent(editor.value);
        safeLocalStorageSet(FILENAME_KEY, filenameInput.value);
        if (saved) showSaveHint();
      }, 500);
    }

    function showSaveHint() {
      saveHint.textContent = '✓ ' + t('saved');
      saveHint.classList.add('show');
      setTimeout(() => saveHint.classList.remove('show'), 1500);
    }

    // 手动保存
    async function saveToLocal() {
      const saved = await persistContent(editor.value);
      safeLocalStorageSet(FILENAME_KEY, filenameInput.value);
      if (saved) {
        showSaveHint();
        showToast(t('toastSaved'));
      }
    }

    // 导出文件
    function exportFile() {
      const blob = new Blob([editor.value], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      let name = filenameInput.value.trim();
      if (!name) name = '未命名文档.md';
      if (!name.toLowerCase().endsWith('.md') && !name.toLowerCase().endsWith('.markdown')) {
        name += '.md';
      }
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('toastExported'));
    }

    // 导出 Word：将 Markdown 渲染为 HTML 并伪装成 .doc 下载
    function exportWord() {
      let name = filenameInput.value.trim();
      if (!name) name = '未命名文档.md';
      name = name.replace(/\.md$/i, '').replace(/\.markdown$/i, '') + '.doc';

      const md = editor.value;
      let bodyHtml;
      if (typeof marked !== 'undefined') {
        bodyHtml = sanitizeHtml(marked.parse(md));
      } else {
        bodyHtml = '<pre style="white-space:pre-wrap">' + escapeHtml(md) + '</pre>';
      }

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(name.replace(/\.doc$/i, ''))}</title>
  <style>
    body { font-family: "Microsoft YaHei", "SimSun", "PingFang SC", sans-serif; font-size: 12pt; line-height: 1.6; color: #000; }
    h1 { font-size: 20pt; font-weight: bold; margin: 18pt 0 10pt; }
    h2 { font-size: 16pt; font-weight: bold; margin: 14pt 0 8pt; }
    h3 { font-size: 14pt; font-weight: bold; margin: 12pt 0 6pt; }
    h4, h5, h6 { font-size: 12pt; font-weight: bold; margin: 10pt 0 6pt; }
    p { margin: 6pt 0; }
    pre, code { font-family: Consolas, "Courier New", monospace; }
    pre { background: #f5f5f5; padding: 8pt; border-radius: 4px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 1pt 3pt; border-radius: 2px; }
    blockquote { border-left: 3px solid #ccc; margin: 6pt 0; padding: 4pt 10pt; color: #555; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
    th, td { border: 1px solid #ccc; padding: 5pt 8pt; }
    th { background: #f5f5f5; font-weight: bold; }
    ul, ol { margin: 6pt 0; padding-left: 24pt; }
    li { margin: 3pt 0; }
    img { max-width: 100%; height: auto; }
    hr { border: none; border-top: 1px solid #ccc; margin: 12pt 0; }
    a { color: #0563c1; text-decoration: underline; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

      const blob = new Blob([fullHtml], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('toastWordExported'));
    }

    // 导出 HTML：将 Markdown 渲染为独立 HTML 页面并下载
    function exportHTML() {
      let name = filenameInput.value.trim();
      if (!name) name = '未命名文档.md';
      name = name.replace(/\.md$/i, '').replace(/\.markdown$/i, '') + '.html';

      const md = editor.value;
      let bodyHtml;
      if (typeof marked !== 'undefined') {
        bodyHtml = sanitizeHtml(marked.parse(md));
      } else {
        bodyHtml = '<pre style="white-space:pre-wrap">' + escapeHtml(md) + '</pre>';
      }

      const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(name.replace(/\.html$/i, ''))}</title>
  <link rel="stylesheet" href="public/vendor/katex-0.16.9/katex.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 16px; line-height: 1.7; max-width: 820px; margin: 40px auto; padding: 0 20px; color: #212529; background: #fff; }
    h1, h2, h3, h4, h5, h6 { margin: 24px 0 12px; font-weight: 600; line-height: 1.25; color: #212529; }
    h1 { font-size: 2em; border-bottom: 1px solid #dee2e6; padding-bottom: 8px; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #dee2e6; padding-bottom: 6px; }
    h3 { font-size: 1.25em; }
    p { margin: 0 0 14px; }
    a { color: #0d6efd; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul, ol { margin: 0 0 14px; padding-left: 2em; }
    li { margin: 4px 0; }
    li.task-item { list-style: none; margin-left: -1.4em; }
    ul.task-list { padding-left: 1.8em; }
    code { background: #f1f3f5; padding: 2px 6px; border-radius: 4px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.9em; }
    pre { background: #f1f3f5; padding: 14px; border-radius: 8px; overflow-x: auto; margin: 0 0 14px; }
    pre code { background: transparent; padding: 0; font-size: 0.9em; }
    blockquote { margin: 0 0 14px; padding: 8px 16px; border-left: 4px solid #8a93a1; background: #f1f3f5; color: #6c757d; font-size: 0.95em; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
    th, td { border: 1px solid #dee2e6; padding: 8px 12px; text-align: left; }
    th { background: #f1f3f5; font-weight: 600; }
    img { max-width: 100%; height: auto; border-radius: 6px; }
    hr { border: none; border-top: 1px solid #dee2e6; margin: 20px 0; }
    .katex { font-size: 1.1em; }
    .katex-display { margin: 16px 0; overflow-x: auto; }
  </style>
</head>
<body>
${bodyHtml}
<script src="public/vendor/katex-0.16.9/katex.min.js">${'</scr' + 'ipt>'}
<script src="public/vendor/katex-0.16.9/contrib/auto-render.min.js">${'</scr' + 'ipt>'}
<script>
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof renderMathInElement !== 'undefined') {
      renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    }
  });
${'</scr' + 'ipt>'}
</body>
</html>`;

      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('toastHtmlExported'));
    }

    function exportPDF() {
      const wasSource = previewMode === 'source';
      if (wasSource) {
        setPreviewMode('preview');
      }
      showToast(t('toastChoosePdf'));
      setTimeout(() => {
        window.print();
        if (wasSource) setPreviewMode('source');
      }, 500);
    }

    function toggleExportMenu() {
      document.getElementById('export-menu').classList.toggle('show');
    }

    function closeExportMenu() {
      document.getElementById('export-menu').classList.remove('show');
    }

    // 导出图片
    let currentImageRatio = '9:16';
    let currentImageDataUrl = '';

    const RATIO_PRESETS = {
      '9:16':  { width: 1080, height: 1920 },
      '4:5':   { width: 1080, height: 1350 },
      '3:4':   { width: 1080, height: 1440 },
      '1:1':   { width: 1080, height: 1080 },
      '16:9':  { width: 1920, height: 1080 }
    };

    const IMAGE_PLACEHOLDER = 'data:image/svg+xml;base64,' + btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">' +
      '<rect width="120" height="80" fill="#e9ecef"/>' +
      '<text x="60" y="44" text-anchor="middle" font-size="12" fill="#6c757d">Image unavailable</text>' +
      '</svg>'
    );

    function openExportImageModal() {
      if (previewMode !== 'preview') {
        setPreviewMode('preview');
      }
      ensureDomToImage().catch(() => {});
      const el = document.getElementById('export-image-modal');
      el.style.display = 'flex';
      void el.offsetWidth;
      el.classList.add('show');
      document.getElementById('image-crop-fit').checked = false;
      selectImageRatio(currentImageRatio);
    }

    function closeExportImageModal() {
      const el = document.getElementById('export-image-modal');
      el.classList.remove('show');
      setTimeout(() => { if (!el.classList.contains('show')) el.style.display = 'none'; }, 200);
    }

    function selectImageRatio(ratio) {
      currentImageRatio = ratio;
      document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ratio === ratio);
      });
      renderExportImagePreview();
    }

    function prepareExportImages(root) {
      const imgs = root.querySelectorAll('img');
      return Promise.all(Array.from(imgs).map(img => new Promise(resolve => {
        if (!img.src || img.src.startsWith('data:')) {
          resolve();
          return;
        }
        const test = new Image();
        test.crossOrigin = 'anonymous';
        test.onload = () => {
          img.crossOrigin = 'anonymous';
          img.src = test.src;
          resolve();
        };
        test.onerror = () => {
          img.src = IMAGE_PLACEHOLDER;
          resolve();
        };
        const sep = img.src.includes('?') ? '&' : '?';
        test.src = img.src + sep + '_cors=' + Date.now();
      })));
    }

    async function renderExportImagePreview() {
      try {
        await ensureDomToImage();
      } catch (err) {
        showToast(t('toastImageLibMissing'));
        return;
      }
      if (typeof domtoimage === 'undefined') {
        showToast(t('toastImageLibMissing'));
        return;
      }

      const preset = RATIO_PRESETS[currentImageRatio];
      const stage = document.getElementById('export-image-stage');
      const container = document.getElementById('export-image-content');

      container.innerHTML = '';
      const clone = document.createElement('div');
      clone.className = 'preview-content';
      clone.innerHTML = preview.innerHTML;
      clone.style.width = preset.width + 'px';
      clone.style.padding = Math.round(preset.width * 0.04) + 'px ' + Math.round(preset.width * 0.045) + 'px';
      clone.style.fontSize = Math.round(preset.width / 36) + 'px';
      clone.style.lineHeight = '1.7';
      clone.style.boxSizing = 'border-box';
      clone.style.background = 'var(--panel-bg)';
      clone.style.color = 'var(--text)';
      clone.style.overflow = 'visible';
      clone.style.maxWidth = 'none';
      clone.style.margin = '0';
      container.appendChild(clone);

      const markdownBody = clone.querySelector('.markdown-body');
      if (markdownBody) {
        markdownBody.style.maxWidth = 'none';
        markdownBody.style.width = '100%';
        markdownBody.style.margin = '0';
      }

      stage.style.width = preset.width + 'px';
      stage.style.height = 'auto';

      await prepareExportImages(clone);

      const cropFit = document.getElementById('image-crop-fit').checked;
      const targetHeight = preset.height;
      const naturalHeight = clone.scrollHeight;

      let captureHeight;
      if (naturalHeight < targetHeight) {
        clone.style.minHeight = targetHeight + 'px';
        clone.style.height = targetHeight + 'px';
        captureHeight = targetHeight;
      } else if (cropFit) {
        clone.style.height = targetHeight + 'px';
        clone.style.overflow = 'hidden';
        captureHeight = targetHeight;
      } else {
        clone.style.height = 'auto';
        clone.style.overflow = 'visible';
        captureHeight = naturalHeight;
      }

      stage.style.height = captureHeight + 'px';

      try {
        const dataUrl = await domtoimage.toPng(clone, {
          width: preset.width,
          height: captureHeight,
          bgcolor: getComputedStyle(clone).backgroundColor || '#ffffff',
          cacheBust: true,
          imagePlaceholder: IMAGE_PLACEHOLDER
        });
        currentImageDataUrl = dataUrl;
        const previewImg = document.getElementById('export-image-preview');
        previewImg.src = dataUrl;
        previewImg.style.display = 'block';
        showToast(t('toastPreviewGenerated'));
      } catch (err) {
        console.error(err);
        showToast(t('toastImageGenFailed', err.message));
      } finally {
        clone.style.height = '';
        clone.style.minHeight = '';
        clone.style.overflow = '';
      }
    }

    function downloadExportImage() {
      if (!currentImageDataUrl) {
        showToast(t('toastGeneratePreviewFirst'));
        return;
      }
      let name = filenameInput.value.trim();
      if (!name) name = '未命名文档.md';
      name = name.replace(/\.(md|markdown|txt|html|doc)$/i, '') + '.png';

      const a = document.createElement('a');
      a.href = currentImageDataUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(t('toastImageDownloaded'));
    }

    // 加载文件内容到编辑器（文件输入与拖放共用）
    function loadFile(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        editor.value = e.target.result;
        let name = file.name;
        if (!name.toLowerCase().endsWith('.md') && !name.toLowerCase().endsWith('.markdown')) {
          name += '.md';
        }
        filenameInput.value = name;
        updatePreview();
        updateCount();
        saveToLocal();
        showToast(t('toastFileImported'));
      };
      reader.readAsText(file);
    }

    // 导入文件
    function importFile(input) {
      const file = input.files[0];
      if (file) loadFile(file);
      input.value = '';
    }

    // 切换主题
    function toggleTheme() {
      const current = document.body.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      if (mermaidReady || typeof mermaid !== 'undefined') {
        initMermaidTheme(next);
      }
      updatePreview();
    }

    // 清空文档
    function clearDoc() {
      if (confirm(t('confirmClear'))) {
        editor.value = '';
        updatePreview();
        updateCount();
        saveToLocal();
      }
    }

    // 历史记录
    function pushHistory() {
      clearTimeout(historyTimer);
      recordHistory();
    }

    function recordHistory() {
      const text = editor.value;
      if (text === lastHistoryText) return;
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(text);
      if (historyStack.length > MAX_HISTORY) historyStack.shift();
      historyIndex = historyStack.length - 1;
      lastHistoryText = text;
    }

    function undo() {
      if (historyIndex <= 0) return;
      historyIndex--;
      editor.value = historyStack[historyIndex];
      lastHistoryText = editor.value;
      if (previewMode === 'source') previewSource.value = editor.value;
      updatePreview();
      updateCount();
      autoSave();
      getActiveEditor().focus();
      showToast(t('toastUndone'));
    }

    function redo() {
      if (historyIndex >= historyStack.length - 1) return;
      historyIndex++;
      editor.value = historyStack[historyIndex];
      lastHistoryText = editor.value;
      if (previewMode === 'source') previewSource.value = editor.value;
      updatePreview();
      updateCount();
      autoSave();
      getActiveEditor().focus();
      showToast(t('toastRedone'));
    }

    // 工具栏格式化
    function formatBold() {
      pushHistory();
      wrapSelection('**', '**');
    }
    function formatItalic() {
      pushHistory();
      wrapSelection('*', '*');
    }
    function formatUnderline() {
      pushHistory();
      wrapSelection('<u>', '</u>');
    }
    function formatStrikethrough() {
      pushHistory();
      wrapSelection('~~', '~~');
    }
    function formatSubscript() {
      pushHistory();
      wrapSelection('<sub>', '</sub>');
    }
    function formatSuperscript() {
      pushHistory();
      wrapSelection('<sup>', '</sup>');
    }
    function insertCodeRow() {
      pushHistory();
      wrapSelection('`', '`');
    }
    function insertCode() {
      pushHistory();
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = el.value;
      const selected = text.slice(start, end);
      const insert = selected.includes('\n') ? '```\n' + selected + '\n```' : '`' + selected + '`';
      el.setRangeText(insert, start, end, 'select');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      el.focus();
    }
    function wrapSelection(before, after) {
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const text = el.value;
      const selected = text.slice(start, end);
      el.setRangeText(before + selected + after, start, end, 'select');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      el.focus();
    }

    function formatQuote() {
      pushHistory();
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = el.value.slice(start, end) || t('quote');
      const quoted = '> ' + selected.replace(/\n/g, '\n> ');
      el.setRangeText(quoted, start, end, 'select');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      el.focus();
    }

    function formatUnorderedList() {
      prefixLines('- ');
    }
    function formatOrderedList() {
      prefixLines('1. ');
    }
    function formatTaskList() {
      prefixLines('- [ ] ');
    }

    function prefixLines(prefix) {
      pushHistory();
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const before = el.value.slice(0, start);
      const selected = el.value.slice(start, end) || t('unordered');
      const after = el.value.slice(end);
      const firstLineStart = before.lastIndexOf('\n') + 1;
      const lines = selected.split('\n');
      const prefixed = lines.map(line => (line ? prefix + line : line)).join('\n');
      el.setRangeText(prefixed, firstLineStart, end, 'end');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      el.focus();
    }

    function insertHeading(level) {
      pushHistory();
      const el = getActiveEditor();
      const start = el.selectionStart;
      const before = el.value.slice(0, start);
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = el.value.indexOf('\n', lineStart);
      const end = lineEnd === -1 ? el.value.length : lineEnd;
      const currentLine = el.value.slice(lineStart, end);
      const newLine = '#'.repeat(level) + ' ' + currentLine.replace(/^#{0,6}\s*/, '');
      el.setRangeText(newLine, lineStart, end, 'end');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      el.focus();
    }

    function toggleHeadingMenu() {
      document.getElementById('heading-menu').classList.toggle('show');
    }
    function closeHeadingMenu() {
      document.getElementById('heading-menu').classList.remove('show');
    }

    function getActiveEditor() {
      if (previewMode === 'source' && document.activeElement === previewSource) {
        return previewSource;
      }
      return editor;
    }

    function syncEditorFromActive() {
      const el = getActiveEditor();
      if (el === previewSource) {
        editor.value = previewSource.value;
      } else if (previewMode === 'source') {
        previewSource.value = editor.value;
      }
    }

    function insertLink() {
      pushHistory();
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = el.value.slice(start, end) || t('link');
      const url = prompt(t('promptLinkUrl'), t('promptLinkDefault'));
      if (!url) return;
      el.setRangeText('[' + selected + '](' + url + ')', start, end, 'end');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      el.focus();
    }

    function insertImageMarkdown(alt, url) {
      pushHistory();
      const safeAlt = String(alt).replace(/\]/g, '\\]');
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.setRangeText('![' + (safeAlt || t('image')) + '](' + url + ')', start, end, 'end');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      el.focus();
    }

    const TABLE_GRID_ROWS = 8;
    const TABLE_GRID_COLS = 8;

    function initTableGrid() {
      const grid = document.getElementById('table-grid');
      if (!grid || grid.children.length) return;
      grid.innerHTML = '';
      for (let r = 1; r <= TABLE_GRID_ROWS; r++) {
        for (let c = 1; c <= TABLE_GRID_COLS; c++) {
          const cell = document.createElement('div');
          cell.className = 'table-grid-cell';
          cell.dataset.row = r;
          cell.dataset.col = c;
          grid.appendChild(cell);
        }
      }
      grid.addEventListener('mouseover', (e) => {
        if (!e.target.classList.contains('table-grid-cell')) return;
        highlightTableCells(parseInt(e.target.dataset.row), parseInt(e.target.dataset.col));
      });
      grid.addEventListener('click', (e) => {
        if (!e.target.classList.contains('table-grid-cell')) return;
        const rows = parseInt(e.target.dataset.row);
        const cols = parseInt(e.target.dataset.col);
        insertTable(rows, cols);
        closeTableMenu();
      });
      grid.addEventListener('mouseleave', () => {
        highlightTableCells(0, 0);
      });
    }

    function highlightTableCells(rows, cols) {
      document.querySelectorAll('.table-grid-cell').forEach(cell => {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        cell.classList.toggle('active', r <= rows && c <= cols);
      });
      const label = document.getElementById('table-size-label');
      if (label) label.textContent = t('tableSizeLabel', rows, cols);
    }

    function toggleTableMenu() {
      initTableGrid();
      highlightTableCells(0, 0);
      document.getElementById('table-menu').classList.toggle('show');
    }

    function closeTableMenu() {
      document.getElementById('table-menu').classList.remove('show');
    }

    function insertTable(rows, cols) {
      if (!rows || !cols) return;
      pushHistory();
      const headerCols = Array.from({ length: cols }, (_, i) => ' 列' + (i + 1) + ' ').join('|');
      const separator = '|' + Array.from({ length: cols }, () => ' --- ').join('|') + '|';
      const dataCols = '|' + Array.from({ length: cols }, () => ' 内容 ').join('|') + '|';
      let table = '\n|' + headerCols + '|\n' + separator;
      for (let r = 2; r <= rows; r++) {
        table += '\n' + dataCols;
      }
      table += '\n';
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.setRangeText(table, start, end, 'end');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      el.focus();
    }

    // 数学公式插入
    // latex 中 | 为光标位置；选区非空时优先填入 | 处
    const MATH_TEMPLATES = {
      inline: { latex: '|', wrap: 'inline' },
      block: { latex: '|', wrap: 'display' },
      sup: { latex: '^{|}', wrap: 'inline' },
      sub: { latex: '_{|}', wrap: 'inline' },
      lparen: { latex: '(', wrap: 'inline' },
      rparen: { latex: ')', wrap: 'inline' },
      abs: { latex: '\\lvert |\\rvert', wrap: 'inline' },
      percent: { latex: '\\%', wrap: 'inline' },
      pow2: { latex: '|^{2}', wrap: 'inline' },
      pow3: { latex: '|^{3}', wrap: 'inline' },
      powy: { latex: 'x^{|}', wrap: 'inline' },
      exp: { latex: 'e^{|}', wrap: 'inline' },
      pow10: { latex: '10^{|}', wrap: 'inline' },
      recip: { latex: '\\dfrac{1}{|}', wrap: 'inline' },
      frac: { latex: '\\frac{|}{}', wrap: 'inline' },
      dfrac: { latex: '\\dfrac{|}{}', wrap: 'display' },
      sqrt: { latex: '\\sqrt{|}', wrap: 'inline' },
      cbrt: { latex: '\\sqrt[3]{|}', wrap: 'inline' },
      sqrtn: { latex: '\\sqrt[n]{|}', wrap: 'inline' },
      fact: { latex: '(|)!', wrap: 'inline' },
      sin: { latex: '\\sin(|)', wrap: 'inline' },
      cos: { latex: '\\cos(|)', wrap: 'inline' },
      tan: { latex: '\\tan(|)', wrap: 'inline' },
      ln: { latex: '\\ln(|)', wrap: 'inline' },
      log10: { latex: '\\log_{10}(|)', wrap: 'inline' },
      log: { latex: '\\log_{n}(|)', wrap: 'inline' },
      sinh: { latex: '\\sinh(|)', wrap: 'inline' },
      cosh: { latex: '\\cosh(|)', wrap: 'inline' },
      tanh: { latex: '\\tanh(|)', wrap: 'inline' },
      arcsin: { latex: '\\arcsin(|)', wrap: 'inline' },
      arccos: { latex: '\\arccos(|)', wrap: 'inline' },
      arctan: { latex: '\\arctan(|)', wrap: 'inline' },
      sum: { latex: '\\sum_{i=1}^{n} |', wrap: 'display' },
      prod: { latex: '\\prod_{i=1}^{n} |', wrap: 'display' },
      int: { latex: '\\int_{a}^{b} | \\, dx', wrap: 'display' },
      iint: { latex: '\\iint_{D} | \\, dA', wrap: 'display' },
      lim: { latex: '\\lim_{n \\to \\infty} |', wrap: 'display' },
      partial: { latex: '\\frac{\\partial |}{\\partial x}', wrap: 'inline' },
      cases: { latex: '\\begin{cases}\n  | \\\\\\\\\n  \n\\end{cases}', wrap: 'display' },
      aligned: { latex: '\\begin{aligned}\n  | &= \\\\\\\\\n   &= \n\\end{aligned}', wrap: 'display' },
      pmatrix: { latex: '\\begin{pmatrix}\n  a & b \\\\\\\\\n  c & d\n\\end{pmatrix}', wrap: 'display' },
      bmatrix: { latex: '\\begin{bmatrix}\n  a & b \\\\\\\\\n  c & d\n\\end{bmatrix}', wrap: 'display' },
      vmatrix: { latex: '\\begin{vmatrix}\n  a & b \\\\\\\\\n  c & d\n\\end{vmatrix}', wrap: 'display' },
      plus: { latex: '+', wrap: 'inline' },
      minus: { latex: '-', wrap: 'inline' },
      pm: { latex: '\\pm', wrap: 'inline' },
      times: { latex: '\\times', wrap: 'inline' },
      div: { latex: '\\div', wrap: 'inline' },
      cdot: { latex: '\\cdot', wrap: 'inline' },
      neq: { latex: '\\neq', wrap: 'inline' },
      leq: { latex: '\\leq', wrap: 'inline' },
      geq: { latex: '\\geq', wrap: 'inline' },
      approx: { latex: '\\approx', wrap: 'inline' },
      infty: { latex: '\\infty', wrap: 'inline' },
      rightarrow: { latex: '\\rightarrow', wrap: 'inline' },
      econst: { latex: 'e', wrap: 'inline' },
      alpha: { latex: '\\alpha', wrap: 'inline' },
      beta: { latex: '\\beta', wrap: 'inline' },
      theta: { latex: '\\theta', wrap: 'inline' },
      pi: { latex: '\\pi', wrap: 'inline' },
      delta: { latex: '\\Delta', wrap: 'inline' },
      omega: { latex: '\\omega', wrap: 'inline' },
      degree: { latex: '^{\\circ}', wrap: 'inline' },
      // 常用公式（小学 / 初中 / 高中）
      rectArea: { latex: 'S = ab', wrap: 'display' },
      triangleArea: { latex: 'S = \\dfrac{1}{2}ah', wrap: 'display' },
      circlePerimeter: { latex: 'C = 2\\pi r', wrap: 'display' },
      circleArea: { latex: 'S = \\pi r^{2}', wrap: 'display' },
      diffSquares: { latex: 'a^{2} - b^{2} = (a+b)(a-b)', wrap: 'display' },
      perfectSquare: { latex: '(a \\pm b)^{2} = a^{2} \\pm 2ab + b^{2}', wrap: 'display' },
      quadratic: { latex: 'x = \\dfrac{-b \\pm \\sqrt{b^{2}-4ac}}{2a}', wrap: 'display' },
      pythagorean: { latex: 'a^{2} + b^{2} = c^{2}', wrap: 'display' },
      linearFn: { latex: 'y = kx + b', wrap: 'display' },
      arithmetic: { latex: 'a_{n} = a_{1} + (n-1)d', wrap: 'display' },
      geometric: { latex: 'S_{n} = \\dfrac{a_{1}(1-q^{n})}{1-q}', wrap: 'display' },
      trigIdentity: { latex: '\\sin^{2}\\theta + \\cos^{2}\\theta = 1', wrap: 'display' },
      ellipse: { latex: '\\dfrac{x^{2}}{a^{2}} + \\dfrac{y^{2}}{b^{2}} = 1', wrap: 'display' },
      derivativeDef: { latex: 'f\'(x) = \\lim_{\\Delta x \\to 0} \\dfrac{f(x+\\Delta x)-f(x)}{\\Delta x}', wrap: 'display' }
    };

    function toggleMathMenu() {
      document.getElementById('math-menu').classList.toggle('show');
    }

    function closeMathMenu() {
      document.getElementById('math-menu')?.classList.remove('show');
    }

    function insertMath(id) {
      const tpl = MATH_TEMPLATES[id];
      if (!tpl) return;
      pushHistory();
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = el.value.slice(start, end);

      let latex = tpl.latex;
      const mark = latex.indexOf('|');
      if (selected && mark >= 0) {
        latex = latex.slice(0, mark) + selected + latex.slice(mark + 1);
      } else {
        latex = latex.replace(/\|/g, '');
      }

      let prefix = '';
      let suffix = '';
      if (tpl.wrap === 'inline') {
        prefix = '$';
        suffix = '$';
      } else if (tpl.wrap === 'display') {
        prefix = '\n$$\n';
        suffix = '\n$$\n';
      }

      const body = latex;
      const insert = prefix + body + suffix;
      let cursorPos;
      if (selected && mark >= 0) {
        cursorPos = start + prefix.length + mark + selected.length;
      } else if (mark >= 0) {
        cursorPos = start + prefix.length + mark;
      } else {
        cursorPos = start + insert.length;
      }

      el.setRangeText(insert, start, end, 'end');
      el.setSelectionRange(cursorPos, cursorPos);
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      closeMathMenu();
      el.focus();
    }

    // 图片上传模态框
    let pendingImageDataUrl = '';

    function openImageModal() {
      pendingImageDataUrl = '';
      document.getElementById('image-url-input').value = '';
      document.getElementById('image-url-alt').value = '';
      document.getElementById('image-upload-alt').value = '';
      document.getElementById('image-upload-preview').innerHTML = '';
      document.getElementById('image-file-input').value = '';
      switchImageTab('url');
      const el = document.getElementById('image-modal');
      el.style.display = 'flex';
      void el.offsetWidth;
      el.classList.add('show');
    }

    function closeImageModal() {
      const el = document.getElementById('image-modal');
      el.classList.remove('show');
      setTimeout(() => { if (!el.classList.contains('show')) el.style.display = 'none'; }, 200);
      pendingImageDataUrl = '';
    }

    function switchImageTab(tab) {
      document.querySelectorAll('.image-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
      });
      document.querySelectorAll('.image-tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === 'image-tab-' + tab);
      });
    }

    function handleImageFileSelect(input) {
      const file = input.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast(t('toastSelectImageFile'));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast(t('toastImageTooLarge'));
        pendingImageDataUrl = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        if (!confirm(t('imageLargeWarning', (file.size / 1024 / 1024).toFixed(1)))) {
          pendingImageDataUrl = '';
          return;
        }
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        pendingImageDataUrl = e.target.result;
        document.getElementById('image-upload-preview').innerHTML = '<img src="' + pendingImageDataUrl + '" alt="' + t('exportImagePreviewAlt') + '" >';
        switchImageTab('upload');
      };
      reader.onerror = () => showToast(t('toastImageReadFailed'));
      reader.readAsDataURL(file);
    }

    function confirmImageInsert() {
      const activeTab = document.querySelector('.image-tab.active').dataset.tab;
      let url = '';
      let alt = '';
      if (activeTab === 'url') {
        url = document.getElementById('image-url-input').value.trim();
        alt = document.getElementById('image-url-alt').value.trim();
        if (!url) {
          showToast(t('toastEnterImageUrl'));
          return;
        }
      } else {
        url = pendingImageDataUrl;
        alt = document.getElementById('image-upload-alt').value.trim();
        if (!url) {
          showToast(t('toastSelectImageFirst'));
          return;
        }
      }
      insertImageMarkdown(alt || t('image'), url);
      closeImageModal();
    }

    // Mermaid 图表
    const MERMAID_TEMPLATES = {
      mindmap: `mindmap\n  root((主题))\n    子主题 A\n      子节点 A1\n      子节点 A2\n    子主题 B\n      子节点 B1`,
      flowchart: `flowchart TD\n    A[开始] --> B{判断}\n    B -->|是| C[执行]\n    B -->|否| D[结束]`
    };

    function openMermaidModal() {
      document.getElementById('mermaid-type').value = 'mindmap';
      updateMermaidTemplate();
      const el = document.getElementById('mermaid-modal');
      el.style.display = 'flex';
      void el.offsetWidth;
      el.classList.add('show');
    }

    function closeMermaidModal() {
      const el = document.getElementById('mermaid-modal');
      el.classList.remove('show');
      setTimeout(() => { if (!el.classList.contains('show')) el.style.display = 'none'; }, 200);
    }

    function updateMermaidTemplate() {
      const type = document.getElementById('mermaid-type').value;
      document.getElementById('mermaid-code').value = MERMAID_TEMPLATES[type] || MERMAID_TEMPLATES.mindmap;
    }

    function confirmMermaidInsert() {
      const code = document.getElementById('mermaid-code').value.trim();
      if (!code) {
        showToast(t('toastMermaidEmpty'));
        return;
      }
      pushHistory();
      const el = getActiveEditor();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const fenced = '\n```mermaid\n' + code + '\n```\n\n';
      el.setRangeText(fenced, start, end, 'end');
      syncEditorFromActive();
      updatePreview();
      updateCount();
      autoSave();
      closeMermaidModal();
      showToast(t('toastMermaidInserted'));
    }

    async function renderMermaidBlocksAsync() {
      const blocks = preview.querySelectorAll('.markdown-body pre code.language-mermaid');
      if (!blocks.length) return;
      try {
        await ensureMermaid();
        renderMermaidBlocks();
      } catch (err) {
        console.error('Mermaid load error:', err);
      }
    }

    function renderMermaidBlocks() {
      if (typeof mermaid === 'undefined') return;
      const blocks = preview.querySelectorAll('.markdown-body pre code.language-mermaid');
      if (!blocks.length) return;
      blocks.forEach(code => {
        const pre = code.parentElement;
        const source = code.textContent.trim();
        if (!source) return;
        const container = document.createElement('div');
        container.className = 'mermaid';
        container.textContent = source;
        pre.replaceWith(container);
      });
      try {
        mermaid.run({ querySelector: '.markdown-body .mermaid' });
      } catch (err) {
        console.error('Mermaid render error:', err);
      }
    }

    // 视图布局与全屏
    function setLayoutMode(mode) {
      if (mode === 'edit') {
        editorCollapsed = false;
        previewCollapsed = true;
      } else if (mode === 'preview') {
        editorCollapsed = true;
        previewCollapsed = false;
        if (previewMode !== 'preview') setPreviewMode('preview');
      } else {
        editorCollapsed = false;
        previewCollapsed = false;
      }
      applyPaneStates();
      localStorage.setItem(LAYOUT_MODE_KEY, mode);
      updateViewMenuLabel();
    }

    function toggleViewMenu() {
      document.getElementById('view-menu').classList.toggle('show');
    }
    function closeViewMenu() {
      document.getElementById('view-menu').classList.remove('show');
    }
    function updateViewMenuLabel() {
      const mode = localStorage.getItem(LAYOUT_MODE_KEY) || 'both';
      const labels = { both: t('view'), edit: t('viewEdit'), preview: t('viewPreview') };
      const btn = document.querySelector('#view-dropdown > button');
      if (btn) btn.innerHTML = (labels[mode] || t('view')) + ' ▾';
    }

    function togglePageFullscreen() {
      const app = document.querySelector('.app');
      app.classList.toggle('page-fullscreen');
      const isActive = app.classList.contains('page-fullscreen');
      document.body.classList.toggle('page-fullscreen-active', isActive);
      localStorage.setItem(PAGE_FULLSCREEN_KEY, isActive);
      showToast(isActive ? t('toastPageFullscreenOn') : t('toastPageFullscreenOff'));
    }

    function toggleFullscreen() {
      if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) {
        showToast(t('toastNoFullscreenApi'));
        return;
      }
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } else {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      }
    }

    function onFullscreenChange() {
      const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      // Optionally update toolbar state here in the future
    }

    // 帮助模态框
    function openHelp() {
      const el = document.getElementById('help-modal');
      el.style.display = 'flex';
      void el.offsetWidth;
      el.classList.add('show');
    }
    function closeHelp() {
      const el = document.getElementById('help-modal');
      el.classList.remove('show');
      setTimeout(() => { if (!el.classList.contains('show')) el.style.display = 'none'; }, 200);
      localStorage.setItem(HELP_SHOWN_KEY, 'true');
    }

    // 网页转 Markdown 模态框
    function openUrlModal() {
      const el = document.getElementById('url-modal');
      el.style.display = 'flex';
      void el.offsetWidth;
      el.classList.add('show');
      document.getElementById('url-input').value = '';
      document.getElementById('url-status').textContent = '';
      document.getElementById('url-status').style.color = 'var(--text-muted)';
      document.getElementById('manual-area').style.display = 'none';
      document.getElementById('manual-html').value = '';
      document.getElementById('use-local-proxy').checked = true;
      document.getElementById('proxy-url').style.display = 'block';
      updateProxyPrivacyHint();
      fetchedHtml = '';
    }
    function closeUrlModal() {
      const el = document.getElementById('url-modal');
      el.classList.remove('show');
      setTimeout(() => { if (!el.classList.contains('show')) el.style.display = 'none'; }, 200);
      fetchedHtml = '';
    }

    // 查找与替换
    let findIndex = 0;

    function openFindModal() {
      const el = document.getElementById('find-modal');
      el.style.display = 'flex';
      void el.offsetWidth;
      el.classList.add('show');
      const findInput = document.getElementById('find-input');
      const ed = getActiveEditor();
      if (ed.selectionStart !== ed.selectionEnd) {
        findInput.value = ed.value.slice(ed.selectionStart, ed.selectionEnd);
      }
      document.getElementById('find-status').textContent = '';
      findInput.focus();
      findInput.select();
    }

    function closeFindModal() {
      const el = document.getElementById('find-modal');
      el.classList.remove('show');
      setTimeout(() => { if (!el.classList.contains('show')) el.style.display = 'none'; }, 200);
      document.getElementById('find-status').textContent = '';
    }

    function findNext() {
      const query = document.getElementById('find-input').value;
      const status = document.getElementById('find-status');
      const el = getActiveEditor();
      if (!query) {
        status.textContent = '';
        return;
      }
      const text = el.value;
      let pos = text.indexOf(query, findIndex);
      if (pos === -1) {
        pos = text.indexOf(query, 0);
      }
      if (pos === -1) {
        status.textContent = t('statusNoMatch');
        return;
      }
      findIndex = pos + query.length;
      el.setSelectionRange(pos, findIndex);
      el.focus();
      status.textContent = t('statusFoundMatch');
    }

    function replaceOne() {
      const query = document.getElementById('find-input').value;
      const replacement = document.getElementById('replace-input').value;
      const status = document.getElementById('find-status');
      const el = getActiveEditor();
      if (!query) {
        status.textContent = '';
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = el.value.slice(start, end);
      if (selected !== query) {
        findNext();
        return;
      }
      el.setRangeText(replacement, start, end, 'end');
      syncEditorFromActive();
      findIndex = start + replacement.length;
      updatePreview();
      updateCount();
      autoSave();
      findNext();
    }

    function replaceAll() {
      const query = document.getElementById('find-input').value;
      const replacement = document.getElementById('replace-input').value;
      const status = document.getElementById('find-status');
      const el = getActiveEditor();
      if (!query) {
        status.textContent = '';
        return;
      }
      let count = 0;
      let text = el.value;
      let pos = text.indexOf(query);
      while (pos !== -1) {
        count++;
        text = text.slice(0, pos) + replacement + text.slice(pos + query.length);
        pos = text.indexOf(query, pos + replacement.length);
      }
      if (count > 0) {
        el.value = text;
        syncEditorFromActive();
        findIndex = 0;
        updatePreview();
        updateCount();
        autoSave();
      }
      status.textContent = count > 0 ? t('statusReplacedCount', count) : t('statusNoMatch');
    }

    function updateProxyPrivacyHint() {
      const useLocal = document.getElementById('use-local-proxy').checked;
      const hint = document.getElementById('url-privacy-hint');
      if (hint) hint.style.display = useLocal ? 'none' : 'block';
    }

    function toggleProxyInput() {
      const checked = document.getElementById('use-local-proxy').checked;
      document.getElementById('proxy-url').style.display = checked ? 'block' : 'none';
      updateProxyPrivacyHint();
    }

    // 尝试通过本地代理或公共 CORS 代理获取网页
    async function fetchUrl() {
      const urlInput = document.getElementById('url-input');
      const status = document.getElementById('url-status');
      const manualArea = document.getElementById('manual-area');
      const useLocalProxy = document.getElementById('use-local-proxy').checked;
      const proxyUrlInput = document.getElementById('proxy-url');
      const url = urlInput.value.trim();

      if (!url) {
        status.textContent = t('urlStatusEmptyUrl');
        status.style.color = 'var(--danger)';
        return;
      }

      status.textContent = t('urlStatusFetching');
      status.style.color = 'var(--text-muted)';
      fetchedHtml = '';

      // 优先使用本地代理（可绕过 CORS 和大部分反爬）
      if (useLocalProxy) {
        const proxyUrl = (proxyUrlInput.value.trim() || 'http://localhost:8765/fetch') + '?url=' + encodeURIComponent(url);
        let data = null;
        try {
          const response = await fetch(proxyUrl);
          if (!response.ok) throw new Error('Local proxy response not ok');
          data = await response.json();
          if (data.success === false) {
            throw new Error(data.error || 'Unknown proxy error');
          }
          fetchedHtml = data.html || data.content || '';
          if (!fetchedHtml) throw new Error('Local proxy returned empty content');
          status.textContent = t('urlStatusLocalSuccess');
          status.style.color = 'var(--accent)';
          manualArea.style.display = 'none';
          return;
        } catch (err) {
          const hint = data?.hint ? data.hint : '';
          status.innerHTML = t('urlStatusLocalFailed', err.message) + (hint ? '<br><small>' + hint + '</small>' : '');
          status.style.color = 'var(--danger)';
          manualArea.style.display = 'block';
          return;
        }
      }

      // 公共代理 fallback（第三方服务，注意隐私）
      const proxies = [
        { url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url), type: 'text' },
        { url: 'https://api.allorigins.win/get?url=' + encodeURIComponent(url), type: 'json', field: 'contents' },
        { url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url), type: 'text' }
      ];

      let lastError = '';
      for (const proxy of proxies) {
        try {
          const response = await fetch(proxy.url);
          if (!response.ok) throw new Error('Proxy response not ok');
          let text;
          if (proxy.type === 'json') {
            const data = await response.json();
            text = data[proxy.field];
            // allorigins 有时返回 base64
            if (typeof text === 'string' && /^[A-Za-z0-9+/=]+$/.test(text) && text.length % 4 === 0) {
              try { text = atob(text); } catch (e) {}
            }
          } else {
            text = await response.text();
          }
          if (!text || text.length < 100) throw new Error('Content too short');
          fetchedHtml = text;
          status.textContent = t('urlStatusPublicSuccess');
          status.style.color = 'var(--accent)';
          manualArea.style.display = 'none';
          return;
        } catch (err) {
          lastError = err.message;
        }
      }

      status.textContent = t('urlStatusPublicFailed', lastError);
      status.style.color = 'var(--danger)';
      manualArea.style.display = 'block';
    }

    // 提取网页元信息
    function extractMeta(doc) {
      const title = (doc.querySelector('title')?.textContent?.trim())
        || (doc.querySelector('h1')?.textContent?.trim())
        || '';
      const author = (doc.querySelector('meta[name="author"]')?.content?.trim())
        || (doc.querySelector('meta[property="article:author"]')?.content?.trim())
        || (doc.querySelector('[rel="author"]')?.textContent?.trim())
        || '';
      let published = (doc.querySelector('meta[property="article:published_time"]')?.content?.trim())
        || (doc.querySelector('meta[name="publishdate"]')?.content?.trim())
        || (doc.querySelector('meta[name="date"]')?.content?.trim())
        || (doc.querySelector('time')?.dateTime?.trim())
        || (doc.querySelector('time')?.textContent?.trim())
        || '';
      return { title, author, published };
    }

    // 提取主内容区域
    function extractMainContent(doc) {
      const selectors = ['article', '[role="main"]', '.post-content', '.entry-content', '.article-content', '.content', '#content', 'main'];
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) return el;
      }
      return doc.body;
    }

    // 清理无关元素
    function stripUnwantedElements(root) {
      const selectors = 'script, style, nav, aside, header, footer, form, iframe, img, svg, video, audio, canvas, .ad, .ads, .advertisement, .sidebar, .comments, .comment, #comments, [class*="ad-"], [class*="ads-"], [id*="ad-"], [class*="comment"], [id*="comment"]';
      root.querySelectorAll(selectors).forEach(el => el.remove());
      return root;
    }

    // 将提取的 HTML 转为 Markdown
    function htmlToMarkdown(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent.replace(/\s+/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      const children = Array.from(node.childNodes).map(htmlToMarkdown).join('');
      switch (tag) {
        case 'h1': return '# ' + children.trim() + '\n\n';
        case 'h2': return '## ' + children.trim() + '\n\n';
        case 'h3': return '### ' + children.trim() + '\n\n';
        case 'h4': return '#### ' + children.trim() + '\n\n';
        case 'h5': return '##### ' + children.trim() + '\n\n';
        case 'h6': return '###### ' + children.trim() + '\n\n';
        case 'p': return children.trim() + '\n\n';
        case 'br': return '\n';
        case 'a':
          const href = node.getAttribute('href') || '';
          return '[' + children + '](' + href + ')';
        case 'strong':
        case 'b': return '**' + children + '**';
        case 'em':
        case 'i': return '*' + children + '*';
        case 'code': return '`' + children + '`';
        case 'pre':
          const code = node.querySelector('code');
          if (code) {
            let lang = '';
            const cls = code.className || '';
            const m = cls.match(/language-(\w+)/);
            if (m) lang = m[1];
            return '\n```' + lang + '\n' + code.textContent.trim() + '\n```\n\n';
          }
          return '\n```\n' + children.trim() + '\n```\n\n';
        case 'ul':
          return Array.from(node.children).map(li => '- ' + htmlToMarkdown(li).trim()).join('\n') + '\n\n';
        case 'ol':
          return Array.from(node.children).map((li, idx) => (idx + 1) + '. ' + htmlToMarkdown(li).trim()).join('\n') + '\n\n';
        case 'li': return children.trim();
        case 'blockquote':
          return '> ' + children.trim().replace(/\n/g, '\n> ') + '\n\n';
        case 'hr': return '---\n\n';
        case 'table': return convertTable(node);
        case 'div': return children.trim() + '\n\n';
        case 'figure': return children.trim() + '\n\n';
        case 'section': return children.trim() + '\n\n';
        default: return children;
      }
    }

    function convertTable(table) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) return '';
      let md = '\n';
      rows.forEach((tr, i) => {
        const cells = Array.from(tr.querySelectorAll('td, th')).map(td => {
          return htmlToMarkdown(td).trim().replace(/\|/g, '\\|');
        });
        if (cells.length) {
          md += '| ' + cells.join(' | ') + ' |\n';
          if (i === 0) {
            md += '|' + cells.map(() => '---').join('|') + '|\n';
          }
        }
      });
      return md + '\n';
    }

    // 转换并插入到编辑器
    function convertAndInsert() {
      const manualHtml = document.getElementById('manual-html').value.trim();
      const html = fetchedHtml || manualHtml;
      if (!html) {
        showToast(t('toastNoContent'));
        return;
      }
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const meta = extractMeta(doc);
        const main = extractMainContent(doc);
        const cleaned = stripUnwantedElements(main.cloneNode(true));
        let bodyMd = htmlToMarkdown(cleaned).replace(/\n{3,}/g, '\n\n').trim();

        // 避免 bodyMd 以 h1 开头与标题重复
        if (meta.title && bodyMd.toLowerCase().startsWith('# ' + meta.title.toLowerCase())) {
          bodyMd = bodyMd.replace(/^#\s+.+\n+/, '');
        }

        let markdown = '';
        if (meta.title) markdown += '# ' + meta.title + '\n\n';
        const metaParts = [];
        if (meta.author) metaParts.push(t('metaAuthor', meta.author));
        if (meta.published) metaParts.push(t('metaPublished', meta.published));
        if (metaParts.length) markdown += '> ' + metaParts.join(' | ') + '\n\n';
        markdown += bodyMd;
        markdown = markdown.trim();

        if (!markdown) {
          showToast(t('toastExtractFailed'));
          return;
        }

        if (!editor.value.trim()) {
          editor.value = markdown;
        } else {
          editor.value += '\n\n' + markdown;
        }

        if (previewMode === 'source') {
          previewSource.value = editor.value;
        }
        updatePreview();
        updateCount();
        saveToLocal();
        closeUrlModal();
        showToast(t('toastInsertedMd'));
      } catch (err) {
        showToast(t('toastConvertFailed', err.message));
      }
    }

    // Toast 提示
    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    // 事件监听
    editor.addEventListener('input', () => {
      clearTimeout(historyTimer);
      historyTimer = setTimeout(recordHistory, 400);
      schedulePreviewUpdate();
      updateCount();
      autoSave();
    });
    previewSource.addEventListener('input', () => {
      editor.value = previewSource.value;
      clearTimeout(historyTimer);
      historyTimer = setTimeout(recordHistory, 400);
      updateCount();
      autoSave();
    });
    filenameInput.addEventListener('input', autoSave);

    // 拖放文件打开
    const dropOverlay = document.getElementById('drop-overlay');
    let dragCounter = 0;

    function showDropOverlay() {
      if (dropOverlay) dropOverlay.classList.add('show');
    }

    function hideDropOverlay() {
      if (dropOverlay) dropOverlay.classList.remove('show');
    }

    document.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      showDropOverlay();
    });

    document.addEventListener('dragleave', (e) => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        hideDropOverlay();
      }
    });

    document.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      hideDropOverlay();
      const files = e.dataTransfer.files;
      if (!files.length) return;
      const file = files[0];
      const ext = file.name.split('.').pop().toLowerCase();

      const allowedText = ['md', 'markdown', 'txt'];
      if (allowedText.includes(ext)) {
        loadFile(file);
        return;
      }

      if (file.type.startsWith('image/')) {
        if (file.size > 5 * 1024 * 1024) {
          showToast(t('toastImageTooLarge'));
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          insertImageMarkdown(file.name, ev.target.result);
          showToast(t('toastImageInserted'));
        };
        reader.readAsDataURL(file);
        return;
      }

      showToast(t('toastDropUnsupported'));
    });

    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
      const exportDropdown = document.getElementById('export-dropdown');
      if (exportDropdown && !exportDropdown.contains(e.target)) {
        closeExportMenu();
      }
      const headingDropdown = document.getElementById('heading-dropdown');
      if (headingDropdown && !headingDropdown.contains(e.target)) {
        closeHeadingMenu();
      }
      const viewDropdown = document.getElementById('view-dropdown');
      if (viewDropdown && !viewDropdown.contains(e.target)) {
        closeViewMenu();
      }
      const tableDropdown = document.getElementById('table-dropdown');
      if (tableDropdown && !tableDropdown.contains(e.target)) {
        closeTableMenu();
      }
      const mathDropdown = document.getElementById('math-dropdown');
      if (mathDropdown && !mathDropdown.contains(e.target)) {
        closeMathMenu();
      }
      const langDropdown = document.getElementById('lang-dropdown');
      if (langDropdown && !langDropdown.contains(e.target)) {
        closeLangMenu();
      }
    });

    // 全屏状态监听
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    // 快捷键
    function handleEditorKeydown(e) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          saveToLocal();
        } else if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          redo();
        } else if (e.key === 'b') {
          e.preventDefault();
          formatBold();
        } else if (e.key === 'u') {
          e.preventDefault();
          formatUnderline();
        } else if (e.key === 'i' && !e.shiftKey) {
          e.preventDefault();
          formatItalic();
        } else if (e.key === 'k') {
          e.preventDefault();
          insertLink();
        } else if (e.shiftKey && (e.key === 'K')) {
          e.preventDefault();
          openImageModal();
        } else if (e.key === 'f') {
          e.preventDefault();
          openFindModal();
        } else if (e.key === 'h') {
          e.preventDefault();
          openFindModal(true);
        }
      }
      // Tab 缩进
      if (e.key === 'Tab') {
        e.preventDefault();
        const el = getActiveEditor();
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.setRangeText('    ', start, end, 'end');
        syncEditorFromActive();
        updatePreview();
        updateCount();
      }
    }
    editor.addEventListener('keydown', handleEditorKeydown);
    previewSource.addEventListener('keydown', handleEditorKeydown);

    // 启动
    init().catch(err => {
      console.error('Init failed:', err);
      editor.value = (i18n[currentLang] && i18n[currentLang].welcomeDoc) || '';
      updatePreview();
      updateCount();
      applyLanguage();
    });
