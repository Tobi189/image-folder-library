// folder.js
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const folder = params.get('folder');

  const titleEl = document.getElementById('page-title');
  const gridEl = document.getElementById('image-grid');
  const sortSelect = document.getElementById('sort-select');

  if (!titleEl || !gridEl || !sortSelect) return;

  if (!folder) {
    titleEl.textContent = 'Folder not found';
    gridEl.innerHTML = '<div class="empty-state">Missing folder parameter.</div>';
    return;
  }

  let allImages = [];

  sortSelect.addEventListener('change', () => {
    renderMasonry(allImages, folder, sortSelect.value, gridEl);
    localStorage.setItem('sort:' + folder, sortSelect.value);
  });

  try {
    sortSelect.value = localStorage.getItem('sort:' + folder) || 'name-asc';

    const [metaRes, imagesRes] = await Promise.all([
      fetch('/api/folder-meta?folder=' + encodeURIComponent(folder)),
      fetch('/api/folder-images?folder=' + encodeURIComponent(folder))
    ]);

    if (!metaRes.ok || !imagesRes.ok) {
      throw new Error('Failed to load folder');
    }

    const meta = await metaRes.json();
    allImages = await imagesRes.json();

    titleEl.textContent = meta.name || folder;

    if (!Array.isArray(allImages) || allImages.length === 0) {
      gridEl.innerHTML = '<div class="empty-state">No images inside this folder.</div>';
      return;
    }

    renderMasonry(allImages, folder, sortSelect.value, gridEl);
    window.addEventListener('resize', debounce(() => {
      renderMasonry(allImages, folder, sortSelect.value, gridEl);
    }, 150));
  } catch (err) {
    console.error(err);
    titleEl.textContent = 'Error';
    gridEl.innerHTML = '<div class="empty-state">Failed to load images.</div>';
  }
});

function sortImages(images, sortValue) {
  const arr = [...images];

  switch (sortValue) {
    case 'name-desc':
      return arr.sort((a, b) =>
        b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })
      );
    case 'date-asc':
      return arr.sort((a, b) => a.mtimeMs - b.mtimeMs);
    case 'date-desc':
      return arr.sort((a, b) => b.mtimeMs - a.mtimeMs);
    case 'name-asc':
    default:
      return arr.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );
  }
}

function getColumnCount(gridEl) {
  const minWidth = 210;
  const gap = 10;
  const width = gridEl.clientWidth;
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
}

function renderMasonry(images, folder, sortValue, gridEl) {
  const sorted = sortImages(images, sortValue);
  const columnCount = getColumnCount(gridEl);

  gridEl.innerHTML = '';

  const columns = [];
  const heights = new Array(columnCount).fill(0);

  for (let i = 0; i < columnCount; i++) {
    const col = document.createElement('div');
    col.className = 'masonry-column';
    gridEl.appendChild(col);
    columns.push(col);
  }

  for (const image of sorted) {
    const shortestIndex = heights.indexOf(Math.min(...heights));
    const src = '/img?folder=' + encodeURIComponent(folder) + '&file=' + encodeURIComponent(image.name);

    const a = document.createElement('a');
    a.className = 'image-tile';
    a.href = src;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const img = document.createElement('img');
    img.src = src;
    img.alt = image.name;
    img.loading = 'lazy';

    a.appendChild(img);
    columns[shortestIndex].appendChild(a);

    const ratio = image.width && image.height ? image.height / image.width : 1.4;
    heights[shortestIndex] += ratio;
  }
}

function debounce(fn, delay) {
  let timer = null;
  return function () {
    clearTimeout(timer);
    timer = setTimeout(() => fn(), delay);
  };
}