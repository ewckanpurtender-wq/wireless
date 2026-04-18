document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');
  const fileNameDisplay = document.getElementById('file-name');
  const clearBtn = document.getElementById('clear-btn');
  const convertBtn = document.getElementById('convert-btn');
  const statusEl = document.getElementById('status');
  const previewContainer = document.getElementById('preview-container');
  const previewFrame = document.getElementById('preview-frame');

  let selectedFile = null;

  // Drag & Drop Handlers
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

  function handleFile(file) {
    if (!file.name.match(/\.html?$/i)) {
      showStatus('Please select a valid HTML file (.html or .htm)', 'error');
      return;
    }
    selectedFile = file;
    fileNameDisplay.textContent = file.name;
    fileInfo.classList.remove('hidden');
    convertBtn.disabled = false;
    showStatus('', '');
  }

  clearBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    convertBtn.disabled = true;
    previewContainer.classList.add('hidden');
    showStatus('', '');
  });

  convertBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    convertBtn.disabled = true;
    showStatus('⏳ Parsing & separating files...', 'processing');

    try {
      const htmlText = await readFileAsText(selectedFile);
      const { html, css, js } = processHTML(htmlText);

      const zip = new JSZip();
      zip.file('index.html', html);
      if (css.trim()) zip.file('style.css', css);
      if (js.trim()) zip.file('script.js', js);

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, selectedFile.name.replace(/\.[^/.]+$/, '') + '-separated.zip');

      showStatus('✅ Conversion complete! ZIP download started.', 'success');
      previewFrame.srcdoc = html;
      previewContainer.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      showStatus('❌ Error: ' + err.message, 'error');
    } finally {
      convertBtn.disabled = false;
    }
  });

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function processHTML(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    let cssContent = '';
    let jsContent = '';

    // Extract and remove <style> blocks
    doc.querySelectorAll('style').forEach(style => {
      const content = style.textContent.trim();
      if (content) cssContent += content + '\n\n';
      style.remove();
    });

    // Extract and remove inline <script> blocks (ignore external scripts)
    doc.querySelectorAll('script').forEach(script => {
      if (!script.src && script.textContent.trim()) {
        jsContent += script.textContent.trim() + '\n\n';
      }
      script.remove();
    });

    // Inject external references
    const head = doc.head || doc.createElement('head');
    if (cssContent.trim()) {
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'style.css';
      head.appendChild(link);
    }

    // Ensure body exists (DOMParser auto-creates it if missing)
    if (jsContent.trim() && doc.body) {
      const scriptTag = doc.createElement('script');
      scriptTag.src = 'script.js';
      // Placing at end of body preserves original synchronous execution order
      doc.body.appendChild(scriptTag);
    }

    // Serialize back to string
    let cleanedHTML = new XMLSerializer().serializeToString(doc);

    // Clean up XML namespace if DOMParser injected it
    cleanedHTML = cleanedHTML.replace(/ xmlns="[^"]*"/g, '');
    
    // Ensure DOCTYPE is present
    if (!cleanedHTML.startsWith('<!DOCTYPE')) {
      cleanedHTML = '<!DOCTYPE html>\n' + cleanedHTML;
    }

    return { html: cleanedHTML, css: cssContent.trim(), js: jsContent.trim() };
  }

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (type || '');
    statusEl.classList.toggle('hidden', !msg);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});