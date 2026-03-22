// folder.js
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const folder = params.get('folder');

  const titleEl = document.getElementById('page-title');
  const gridEl = document.getElementById('image-grid');
  const sortSelect = document.getElementById('sort-select');

  const viewerEl = document.getElementById('folderViewer');
  const viewerImgEl = document.getElementById('folderViewerImage');
  const viewerCounterEl = document.getElementById('folderViewerCounter');
  const prevBtn = document.getElementById('folderViewerPrev');
  const nextBtn = document.getElementById('folderViewerNext');
  const closeBtn = document.getElementById('folderViewerClose');
  const zoomInBtn = document.getElementById('folderZoomIn');
  const zoomOutBtn = document.getElementById('folderZoomOut');
  const zoomResetBtn = document.getElementById('folderZoomReset');

  if (
    !titleEl || !gridEl || !sortSelect ||
    !viewerEl || !viewerImgEl || !viewerCounterEl ||
    !prevBtn || !nextBtn || !closeBtn ||
    !zoomInBtn || !zoomOutBtn || !zoomResetBtn
  ) return;

  if (!folder) {
    titleEl.textContent = 'Folder not found';
    gridEl.innerHTML = '<div class="empty-state">Missing folder parameter.</div>';
    return;
  }

  let allImages = [];
  let displayedImages = [];
  let currentIndex = 0;
  let zoom = 1;

  sortSelect.addEventListener('change', () => {
    renderMasonry(allImages, folder, sortSelect.value, gridEl);
    localStorage.setItem('sort:' + folder, sortSelect.value);
  });

  prevBtn.addEventListener('click', showPrev);
  nextBtn.addEventListener('click', showNext);
  closeBtn.addEventListener('click', closeViewer);
  zoomInBtn.addEventListener('click', () => setZoom(zoom + 0.2));
  zoomOutBtn.addEventListener('click', () => setZoom(Math.max(0.2, zoom - 0.2)));
  zoomResetBtn.addEventListener('click', () => setZoom(1));

  viewerEl.addEventListener('click', (event) => {
    if (event.target === viewerEl) {
      closeViewer();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (viewerEl.classList.contains('hidden')) return;

    if (event.key === 'Escape') closeViewer();
    else if (event.key === 'ArrowLeft') showPrev();
    else if (event.key === 'ArrowRight') showNext();
    else if (event.key === '+' || event.key === '=') setZoom(zoom + 0.2);
    else if (event.key === '-') setZoom(Math.max(0.2, zoom - 0.2));
    else if (event.key === '0') setZoom(1);
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

  function openViewer(index) {
    displayedImages = sortImages(allImages, sortSelect.value);
    currentIndex = index;
    viewerEl.classList.remove('hidden');
    document.body.classList.add('folder-viewer-open');
    updateViewer();
  }

  function closeViewer() {
    viewerEl.classList.add('hidden');
    document.body.classList.remove('folder-viewer-open');
    viewerImgEl.src = '';
    zoom = 1;
  }

  function showPrev() {
    if (!displayedImages.length) return;
    currentIndex = (currentIndex - 1 + displayedImages.length) % displayedImages.length;
    updateViewer();
  }

  function showNext() {
    if (!displayedImages.length) return;
    currentIndex = (currentIndex + 1) % displayedImages.length;
    updateViewer();
  }

  function updateViewer() {
    const image = displayedImages[currentIndex];
    if (!image) return;

    const src = '/img?folder=' + encodeURIComponent(folder) + '&file=' + encodeURIComponent(image.name);
    viewerImgEl.src = src;
    viewerImgEl.alt = image.name;
    viewerCounterEl.textContent = `${currentIndex + 1} / ${displayedImages.length}`;
    setZoom(1);
  }

  function setZoom(value) {
    zoom = Math.max(0.2, Math.min(5, value));
    viewerImgEl.style.transform = `scale(${zoom})`;
  }

  function renderMasonry(images, folder, sortValue, gridEl) {
    const sorted = sortImages(images, sortValue);
    displayedImages = sorted;

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

    sorted.forEach((image, index) => {
      const shortestIndex = heights.indexOf(Math.min(...heights));
      const src = '/img?folder=' + encodeURIComponent(folder) + '&file=' + encodeURIComponent(image.name);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'image-tile folder-image-button';
      button.addEventListener('click', () => openViewer(index));

      const img = document.createElement('img');
      img.src = src;
      img.alt = image.name;
      img.loading = 'lazy';

      button.appendChild(img);
      columns[shortestIndex].appendChild(button);

      const ratio = image.width && image.height ? image.height / image.width : 1.4;
      heights[shortestIndex] += ratio;
    });
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

function debounce(fn, delay) {
  let timer = null;
  return function () {
    clearTimeout(timer);
    timer = setTimeout(() => fn(), delay);
  };
}