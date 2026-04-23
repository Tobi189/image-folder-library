const grid = document.getElementById('library-grid');
const sortSelect = document.getElementById('library-sort-select');

let allItems = [];

function sortLibraryItems(items, sortValue) {
  const arr = [...items];

  switch (sortValue) {
    case 'name-desc':
      return arr.sort((a, b) =>
        b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })
      );

    case 'date-asc':
      return arr.sort((a, b) => {
        const diff = (a.oldestMtimeMs || 0) - (b.oldestMtimeMs || 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

    case 'date-desc':
      return arr.sort((a, b) => {
        const diff = (b.newestMtimeMs || 0) - (a.newestMtimeMs || 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

    case 'count-asc':
      return arr.sort((a, b) => {
        const diff = (a.mediaCount || 0) - (b.mediaCount || 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

    case 'count-desc':
      return arr.sort((a, b) => {
        const diff = (b.mediaCount || 0) - (a.mediaCount || 0);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

    case 'name-asc':
    default:
      return arr.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );
  }
}

function isVideoFile(name) {
  return /\.(mp4|webm|mov|m4v|ogg)$/i.test(name);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderLibrary(items) {
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">No folders found in /library</div>`;
    return;
  }

  const sortValue = sortSelect?.value || localStorage.getItem('library:sort') || 'name-asc';
  const sortedItems = sortLibraryItems(items, sortValue);

  grid.innerHTML = sortedItems
    .map((item) => {
      const coverUrl = item.cover
        ? `/media?folder=${encodeURIComponent(item.folder)}&file=${encodeURIComponent(item.cover)}`
        : 'cover-placeholder.png';

      const countParts = [];
      if (item.imageCount) countParts.push(`${item.imageCount} image${item.imageCount === 1 ? '' : 's'}`);
      if (item.videoCount) countParts.push(`${item.videoCount} video${item.videoCount === 1 ? '' : 's'}`);
      const countText = countParts.length ? countParts.join(' • ') : 'No media';

      const coverMarkup = item.cover && isVideoFile(item.cover)
        ? `
          <div class="library-cover-wrap">
            <video class="library-cover" src="${coverUrl}" muted playsinline preload="metadata"></video>
            <div class="video-badge library-video-badge">▶</div>
          </div>
        `
        : `
          <div class="library-cover-wrap">
            <img class="library-cover" src="${coverUrl}" alt="${escapeHtml(item.name)}" loading="lazy">
          </div>
        `;

      return `
        <a class="library-card" href="folder.html?folder=${encodeURIComponent(item.folder)}">
          ${coverMarkup}
          <div class="library-meta">
            <div class="library-title">${escapeHtml(item.name)}</div>
            <div class="library-count">${countText}</div>
          </div>
        </a>
      `;
    })
    .join('');
}

async function loadLibrary() {
  const res = await fetch('/api/library');
  const items = await res.json();
  allItems = items;
  renderLibrary(allItems);
}

if (sortSelect) {
  sortSelect.value = localStorage.getItem('library:sort') || 'name-asc';
  sortSelect.addEventListener('change', () => {
    localStorage.setItem('library:sort', sortSelect.value);
    renderLibrary(allItems);
  });
}

loadLibrary().catch((err) => {
  console.error(err);
  grid.innerHTML = `<div class="empty-state">Failed to load library.</div>`;
});