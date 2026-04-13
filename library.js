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
            <div class="library-title">${escapeHtml(item.name)}<\/div>
            <div class="library-count">${countText}<\/div>
          </div>
        </a>
      `;
    })
    .join('');
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

loadLibrary().catch((err) => {
  console.error(err);
  grid.innerHTML = `<div class="empty-state">Failed to load library.</div>`;
});