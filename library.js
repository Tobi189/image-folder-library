// library.js
const grid = document.getElementById('library-grid');

async function loadLibrary() {
  const res = await fetch('/api/library');
  const items = await res.json();

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">No folders found in /library</div>`;
    return;
  }

  grid.innerHTML = items
    .map((item) => {
      const coverUrl = item.cover
        ? `/img?folder=${encodeURIComponent(item.folder)}&file=${encodeURIComponent(item.cover)}`
        : 'cover-placeholder.png';

      return `
        <a class="library-card" href="folder.html?folder=${encodeURIComponent(item.folder)}">
          <div class="library-cover-wrap">
            <img class="library-cover" src="${coverUrl}" alt="${escapeHtml(item.name)}" loading="lazy">
          </div>
          <div class="library-meta">
            <div class="library-title">${escapeHtml(item.name)}</div>
            <div class="library-count">${item.imageCount} image${item.imageCount === 1 ? '' : 's'}</div>
          </div>
        </a>
      `;
    })
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

loadLibrary().catch((err) => {
  console.error(err);
  grid.innerHTML = `<div class="empty-state">Failed to load library.</div>`;
});