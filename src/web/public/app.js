// Maia RAG Web Dashboard Client

// ----------------------------------------------------
// Navigation & Tabs
// ----------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    const content = document.getElementById(target);
    if (content) content.classList.add('active');

    // Trigger tab-specific loads
    if (target === 'tab-documents') loadDocuments();
    if (target === 'tab-collections') loadCollections();
    if (target === 'tab-health') loadHealth();
  });
});

// ----------------------------------------------------
// Health & Stats Bar
// ----------------------------------------------------
async function checkSystemHealth() {
  const pill = document.getElementById('service-status');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ok) {
      pill.textContent = 'System Healthy';
      pill.className = 'status-pill status-ok';
    } else {
      pill.textContent = 'Degraded';
      pill.className = 'status-pill status-fail';
    }
  } catch {
    pill.textContent = 'Offline';
    pill.className = 'status-pill status-fail';
  }
}

async function refreshStats() {
  try {
    const stats = await fetch('/api/stats').then(r => r.json());
    const el = document.getElementById('stats-summary');
    const sizeMb = ((stats.totalSizeBytes || 0) / (1024 * 1024)).toFixed(1);
    el.innerHTML = `
      <div class="card"><span>Documents</span><b>${stats.documents}</b></div>
      <div class="card"><span>Ready Chunks</span><b>${stats.chunks}</b></div>
      <div class="card"><span>Collections</span><b>${stats.collections}</b></div>
      <div class="card"><span>Corpus Size</span><b>${sizeMb} MB</b></div>
    `;
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

// ----------------------------------------------------
// Query / Ask RAG
// ----------------------------------------------------
const queryForm = document.getElementById('query-form');
const queryInput = document.getElementById('query-input');
const queryCollection = document.getElementById('query-collection');
const queryTopk = document.getElementById('query-topk');
const queryMode = document.getElementById('query-mode');
const queryLoading = document.getElementById('query-loading');
const queryResult = document.getElementById('query-result');
const answerText = document.getElementById('answer-text');
const sourcesList = document.getElementById('sources-list');
const sourcesCount = document.getElementById('sources-count');

queryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = queryInput.value.trim();
  if (!question) return;

  queryLoading.classList.remove('hidden');
  queryResult.classList.add('hidden');
  answerText.textContent = '';
  sourcesList.innerHTML = '';

  const mode = queryMode.value;
  const endpoint = mode === 'search' ? '/api/search' : '/api/query';
  const payload = {
    [mode === 'search' ? 'query' : 'question']: question,
    options: {
      topK: Number(queryTopk.value) || 6,
      collectionId: queryCollection.value || undefined
    }
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Query failed');

    queryLoading.classList.add('hidden');
    queryResult.classList.remove('hidden');

    if (mode === 'search') {
      answerText.textContent = `Search found ${data.count} matching knowledge chunks.`;
      renderSources(data.results || []);
    } else {
      answerText.textContent = data.answer || 'No answer generated.';
      renderSources(data.sources || []);
    }
  } catch (err) {
    queryLoading.classList.add('hidden');
    queryResult.classList.remove('hidden');
    answerText.textContent = `Error: ${err.message}`;
  }
});

function renderSources(sources) {
  sourcesCount.textContent = sources.length;
  if (!sources.length) {
    sourcesList.innerHTML = '<p class="text-muted">No relevant source chunks found.</p>';
    return;
  }

  sourcesList.innerHTML = sources.map(s => {
    const loc = s.startLine ? `Lines ${s.startLine}-${s.endLine}` : `Chunk #${s.chunkIndex}`;
    const scorePct = typeof s.score === 'number' ? (s.score * 100).toFixed(1) + '%' : '-';
    return `
      <div class="source-item">
        <div class="source-header">
          <span>[${s.index}] ${escapeHtml(s.filename || 'Unknown')}</span>
          <span class="source-badge">${scorePct}</span>
        </div>
        <p class="hint" style="margin-bottom: 8px;">${loc}</p>
        <div class="source-text">${escapeHtml(s.text || '')}</div>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------
// Ingestion & Drag-and-Drop
// ----------------------------------------------------
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadResults = document.getElementById('upload-results');
const uploadLog = document.getElementById('upload-log');
const ingestCollection = document.getElementById('ingest-collection');
const ingestAiClassify = document.getElementById('ingest-ai-classify');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag');
  if (e.dataTransfer.files?.length) {
    handleFiles(e.dataTransfer.files);
  }
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files?.length) {
    handleFiles(e.target.files);
  }
});

async function handleFiles(files) {
  uploadResults.classList.remove('hidden');
  for (const file of files) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = `Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`;
    uploadLog.prepend(logEntry);

    const fd = new FormData();
    fd.append('file', file, file.name);
    if (ingestCollection.value) {
      fd.append('collectionId', ingestCollection.value);
    }
    fd.append('aiClassification', ingestAiClassify.checked ? 'true' : 'false');

    try {
      const res = await fetch('/api/documents', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingestion failed');

      if (data.duplicate) {
        logEntry.className = 'log-entry dup';
        logEntry.textContent = `[DUPLICATE] ${file.name} already indexed.`;
      } else {
        logEntry.className = 'log-entry ok';
        logEntry.textContent = `[READY] ${file.name} indexed into ${data.chunks} chunks (Type: ${data.aiMetadata?.documentType || 'general'}).`;
      }
    } catch (err) {
      logEntry.className = 'log-entry err';
      logEntry.textContent = `[ERROR] ${file.name}: ${err.message}`;
    }
  }
  refreshStats();
  loadDocuments();
}

// ----------------------------------------------------
// Documents Table
// ----------------------------------------------------
const docsTbody = document.getElementById('docs-tbody');
const docsSearch = document.getElementById('docs-search');
const docsStatusFilter = document.getElementById('docs-status-filter');
const docsRefresh = document.getElementById('docs-refresh');

docsSearch.addEventListener('input', debounce(() => loadDocuments(), 300));
docsStatusFilter.addEventListener('change', () => loadDocuments());
docsRefresh.addEventListener('click', () => loadDocuments());

async function loadDocuments() {
  const search = docsSearch.value.trim();
  const status = docsStatusFilter.value;
  const params = new URLSearchParams({ limit: '100' });
  if (search) params.append('search', search);
  if (status) params.append('status', status);

  try {
    const res = await fetch(`/api/documents?${params.toString()}`);
    const data = await res.json();
    const docs = data.documents || [];

    if (!docs.length) {
      docsTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No documents found.</td></tr>';
      return;
    }

    docsTbody.innerHTML = docs.map(d => {
      const sizeKb = (d.size / 1024).toFixed(1);
      const date = d.created_at ? d.created_at.slice(0, 16).replace('T', ' ') : '-';
      const type = d.aiMetadata?.documentType || '-';
      const domains = (d.aiMetadata?.domains || []).map(x => x.name || x).slice(0, 2).join(', ');
      return `
        <tr>
          <td><strong>${escapeHtml(d.filename)}</strong></td>
          <td><span class="badge badge-${d.status}">${d.status}</span></td>
          <td>${d.chunk_count}</td>
          <td>${sizeKb} KB</td>
          <td>${escapeHtml(type)}${domains ? `<br><small class="text-muted">${escapeHtml(domains)}</small>` : ''}</td>
          <td><small class="text-muted">${date}</small></td>
          <td class="table-actions">
            <button class="btn btn-sm btn-secondary" onclick="viewDocument('${d.id}')">Details</button>
            <button class="btn btn-sm btn-secondary" onclick="downloadOriginal('${d.id}')">Download</button>
            <button class="btn btn-sm btn-secondary" onclick="reprocessDoc('${d.id}')">Reprocess</button>
            <button class="btn btn-sm btn-danger" onclick="deleteDoc('${d.id}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    docsTbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Failed to load documents: ${err.message}</td></tr>`;
  }
}

// ----------------------------------------------------
// Document Actions & Modal
// ----------------------------------------------------
const docModal = document.getElementById('doc-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

modalClose.addEventListener('click', () => docModal.classList.add('hidden'));
window.addEventListener('click', (e) => {
  if (e.target === docModal) docModal.classList.add('hidden');
});

window.viewDocument = async function(id) {
  docModal.classList.remove('hidden');
  modalTitle.textContent = 'Loading document...';
  modalBody.innerHTML = '<p>Fetching document details and vectors...</p>';

  try {
    const res = await fetch(`/api/documents/${id}`);
    const doc = await res.json();
    if (!res.ok) throw new Error(doc.error || 'Failed to fetch details');

    modalTitle.textContent = `${doc.filename} (ID: ${doc.id.slice(0, 8)})`;
    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div class="card">
          <h4>Technical Metadata</h4>
          <p><strong>SHA-256:</strong> <code>${doc.sha256}</code></p>
          <p><strong>MIME Type:</strong> ${doc.mime_type} | <strong>Size:</strong> ${(doc.size / 1024).toFixed(1)} KB</p>
          <p><strong>Status:</strong> <span class="badge badge-${doc.status}">${doc.status}</span> | <strong>Chunks:</strong> ${doc.chunk_count}</p>
          <p><strong>Embedding Model:</strong> ${doc.embedding_model || 'None'}</p>
        </div>

        <div class="card">
          <h4>AI Classification</h4>
          <pre style="font-size: 12px;">${escapeHtml(JSON.stringify(doc.aiMetadata || {}, null, 2))}</pre>
        </div>

        <div class="card">
          <h4>Indexed Chunks (${(doc.chunks || []).length})</h4>
          <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
            ${(doc.chunks || []).map((c, i) => `
              <div style="background: #090d12; padding: 10px; border-radius: 6px;">
                <strong>Chunk #${c.chunkIndex ?? i} ${c.startLine ? `(Lines ${c.startLine}-${c.endLine})` : ''}</strong>
                <pre style="margin-top: 4px; font-size: 11px; white-space: pre-wrap;">${escapeHtml(c.text || '')}</pre>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    modalBody.innerHTML = `<p class="text-danger">Error: ${err.message}</p>`;
  }
};

window.downloadOriginal = function(id) {
  window.open(`/api/documents/${id}/original`, '_blank');
};

window.reprocessDoc = async function(id) {
  if (!confirm('Reprocess and re-embed this document?')) return;
  try {
    const res = await fetch(`/api/documents/${id}/reprocess`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reprocess');
    alert(`Document reprocessed successfully! Chunks: ${data.chunks}`);
    loadDocuments();
    refreshStats();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

window.deleteDoc = async function(id) {
  if (!confirm('Are you sure you want to permanently delete this document and all its indexed vectors?')) return;
  try {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete');
    loadDocuments();
    refreshStats();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

// ----------------------------------------------------
// Collections
// ----------------------------------------------------
const collectionsList = document.getElementById('collections-list');
const createCollForm = document.getElementById('create-collection-form');
const newCollName = document.getElementById('new-coll-name');
const newCollDesc = document.getElementById('new-coll-desc');

createCollForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newCollName.value.trim();
  const description = newCollDesc.value.trim();
  if (!name) return;

  try {
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create collection');

    newCollName.value = '';
    newCollDesc.value = '';
    loadCollections();
    updateCollectionSelects();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

async function loadCollections() {
  try {
    const res = await fetch('/api/collections');
    const list = await res.json();
    if (!list.length) {
      collectionsList.innerHTML = '<p class="text-muted">No collections created yet. Create one above!</p>';
      return;
    }

    collectionsList.innerHTML = list.map(c => `
      <div class="collection-card">
        <div>
          <h4>${escapeHtml(c.name)}</h4>
          <p>${escapeHtml(c.description || 'No description.')}</p>
        </div>
        <div class="collection-footer">
          <span>${c.document_count} documents</span>
          <button class="btn btn-sm btn-danger" onclick="deleteCollection('${c.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    collectionsList.innerHTML = `<p class="text-muted">Failed to load collections: ${err.message}</p>`;
  }
}

window.deleteCollection = async function(id) {
  if (!confirm('Delete this collection? (Documents in this collection will not be deleted)')) return;
  try {
    await fetch(`/api/collections/${id}`, { method: 'DELETE' });
    loadCollections();
    updateCollectionSelects();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
};

async function updateCollectionSelects() {
  try {
    const res = await fetch('/api/collections');
    const list = await res.json();
    const optionsHtml = list.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    queryCollection.innerHTML = `<option value="">All Collections</option>${optionsHtml}`;
    ingestCollection.innerHTML = `<option value="">(Auto-assign based on AI classification)</option>${optionsHtml}`;
  } catch {}
}

// ----------------------------------------------------
// Health & Stats Tab
// ----------------------------------------------------
async function loadHealth() {
  const compContainer = document.getElementById('health-components');
  const errContainer = document.getElementById('recent-errors-container');

  try {
    const health = await fetch('/api/health').then(r => r.json());
    const summary = await fetch('/api/health/summary').then(r => r.json());

    compContainer.innerHTML = `
      <div class="health-card">
        <h4>Ollama <span class="badge badge-${health.components.ollama.status === 'OK' ? 'ready' : 'failed'}">${health.components.ollama.status}</span></h4>
        <p>Base URL: ${health.components.ollama.baseUrl}</p>
      </div>
      <div class="health-card">
        <h4>Qdrant <span class="badge badge-${health.components.qdrant.status === 'OK' ? 'ready' : 'failed'}">${health.components.qdrant.status}</span></h4>
        <p>Vectors: ${health.components.qdrant.vectorsCount ?? 0} | Points: ${health.components.qdrant.pointsCount ?? 0}</p>
      </div>
      <div class="health-card">
        <h4>SQLite <span class="badge badge-${health.components.sqlite.status === 'OK' ? 'ready' : 'failed'}">${health.components.sqlite.status}</span></h4>
        <p>Indexed Documents: ${summary.documents} (${summary.ready} ready)</p>
      </div>
    `;

    if (summary.recentErrors?.length) {
      errContainer.innerHTML = summary.recentErrors.map(e => `
        <div class="log-entry err">
          <strong>${escapeHtml(e.filename)}</strong> [Stage: ${e.stage}]: ${escapeHtml(e.error || 'Unknown error')}
          <br><small class="text-muted">${e.updated_at}</small>
        </div>
      `).join('');
    } else {
      errContainer.innerHTML = '<p class="text-muted">No processing errors recorded.</p>';
    }
  } catch (err) {
    compContainer.innerHTML = `<p class="text-muted">Failed to load health: ${err.message}</p>`;
  }
}

// ----------------------------------------------------
// Utilities
// ----------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Initial Boot
checkSystemHealth();
refreshStats();
updateCollectionSelects();
loadDocuments();
setInterval(checkSystemHealth, 30000);
