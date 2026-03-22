// folder.js
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const folder = params.get('folder');

  const titleEl = document.getElementById('page-title');
  const gridEl = document.getElementById('image-grid');

  if (!titleEl || !gridEl) {
    console.error('Missing page-title or image-grid in folder.html');
    return;
  }

  if (!folder) {
    titleEl.textContent = 'Folder not found';
    gridEl.innerHTML = '<div class="empty-state">Missing folder parameter.</div>';
    return;
  }

  try {
    const metaRes = await fetch('/api/folder-meta?folder=' + encodeURIComponent(folder));
    const imagesRes = await fetch('/api/folder-images?folder=' + encodeURIComponent(folder));

    if (!metaRes.ok) {
      const text = await metaRes.text();
      throw new Error('folder-meta failed: ' + text);
    }

    if (!imagesRes.ok) {
      const text = await imagesRes.text();
      throw new Error('folder-images failed: ' + text);
    }

    const meta = await metaRes.json();
    const images = await imagesRes.json();

    titleEl.textContent = meta.name || folder;

    if (!Array.isArray(images) || images.length === 0) {
      gridEl.innerHTML = '<div class="empty-state">No images inside this folder.</div>';
      return;
    }

    let html = '';
    for (const file of images) {
      const src = '/img?folder=' + encodeURIComponent(folder) + '&file=' + encodeURIComponent(file);
      html += `
        <a class="image-tile" href="${src}" target="_blank" rel="noopener noreferrer">
          <img src="${src}" alt="${escapeHtml(file)}" loading="lazy">
        </a>
      `;
    }

    gridEl.innerHTML = html;
  } catch (err) {
    console.error(err);
    titleEl.textContent = 'Error';
    gridEl.innerHTML = '<div class="empty-state">Failed to load images. Check console.</div>';
  }
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}