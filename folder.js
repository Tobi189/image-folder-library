window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const folder = params.get('folder');

  const titleEl = document.getElementById('page-title');
  const gridEl = document.getElementById('image-grid');
  const sortSelect = document.getElementById('sort-select');

  const viewerEl = document.getElementById('folderViewer');
  const viewerImgEl = document.getElementById('folderViewerImage');
  const viewerVideoEl = document.getElementById('folderViewerVideo');
  const viewerCounterEl = document.getElementById('folderViewerCounter');
  const prevBtn = document.getElementById('folderViewerPrev');
  const nextBtn = document.getElementById('folderViewerNext');
  const closeBtn = document.getElementById('folderViewerClose');
  const zoomInBtn = document.getElementById('folderZoomIn');
  const zoomOutBtn = document.getElementById('folderZoomOut');
  const zoomResetBtn = document.getElementById('folderZoomReset');

  if (
    !titleEl || !gridEl || !sortSelect ||
    !viewerEl || !viewerImgEl || !viewerVideoEl || !viewerCounterEl ||
    !prevBtn || !nextBtn || !closeBtn ||
    !zoomInBtn || !zoomOutBtn || !zoomResetBtn
  ) return;

  if (!folder) {
    titleEl.textContent = 'Folder not found';
    gridEl.innerHTML = '<div class="empty-state">Missing folder parameter.</div>';
    return;
  }

  let allMedia = [];
  let displayedMedia = [];
  let currentIndex = 0;
  let zoom = 1;

  sortSelect.addEventListener('change', () => {
    renderMasonry(allMedia, folder, sortSelect.value, gridEl);
    
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

    const [metaRes, mediaRes] = await Promise.all([
      fetch('/api/folder-meta?folder=' + encodeURIComponent(folder)),
      fetch('/api/folder-images?folder=' + encodeURIComponent(folder))
    ]);

    if (!metaRes.ok || !mediaRes.ok) {
      throw new Error('Failed to load folder');
    }

    const meta = await metaRes.json();
    allMedia = await mediaRes.json();

    titleEl.textContent = meta.name || folder;

    if (!Array.isArray(allMedia) || allMedia.length === 0) {
      gridEl.innerHTML = '<div class="empty-state">No media inside this folder.</div>';
      return;
    }

    renderMasonry(allMedia, folder, sortSelect.value, gridEl);

fetch('/api/folder-warm-thumbs?folder=' + encodeURIComponent(folder), {
  method: 'POST'
}).catch((err) => {
  console.warn('Failed to start thumb warm-up:', err);
});

    window.addEventListener('resize', debounce(() => {
      renderMasonry(allMedia, folder, sortSelect.value, gridEl);
    }, 150));
  } catch (err) {
    console.error(err);
    titleEl.textContent = 'Error';
    gridEl.innerHTML = '<div class="empty-state">Failed to load media.</div>';
  }

  function openViewer(index) {
    displayedMedia = sortItems(allMedia, sortSelect.value);
    currentIndex = index;
    viewerEl.classList.remove('hidden');
    document.body.classList.add('folder-viewer-open');
    updateViewer();
  }

  function closeViewer() {
    viewerEl.classList.add('hidden');
    document.body.classList.remove('folder-viewer-open');

    viewerImgEl.src = '';
    viewerImgEl.classList.add('hidden');
    viewerImgEl.style.transform = 'scale(1)';

    viewerVideoEl.pause();
    viewerVideoEl.currentTime = 0;
    viewerVideoEl.onloadeddata = null;
    viewerVideoEl.removeAttribute('src');
    viewerVideoEl.load();
    viewerVideoEl.classList.add('hidden');
    viewerVideoEl.style.transform = 'scale(1)';

    zoom = 1;
  }

  function showPrev() {
    if (!displayedMedia.length) return;
    currentIndex = (currentIndex - 1 + displayedMedia.length) % displayedMedia.length;
    updateViewer();
  }

  function showNext() {
    if (!displayedMedia.length) return;
    currentIndex = (currentIndex + 1) % displayedMedia.length;
    updateViewer();
  }

  function updateViewer() {
    const item = displayedMedia[currentIndex];
    if (!item) return;

    const src = '/media?folder=' + encodeURIComponent(folder) + '&file=' + encodeURIComponent(item.name);

    viewerCounterEl.textContent = `${currentIndex + 1} / ${displayedMedia.length}`;

    if (item.type === 'video') {
      viewerImgEl.src = '';
      viewerImgEl.classList.add('hidden');
      viewerImgEl.style.transform = 'scale(1)';

      viewerVideoEl.pause();
      viewerVideoEl.currentTime = 0;
      viewerVideoEl.onloadeddata = null;
      viewerVideoEl.classList.remove('hidden');
      viewerVideoEl.style.transform = 'scale(1)';

      viewerVideoEl.onloadeddata = () => {
        viewerVideoEl.play().catch((err) => {
          console.warn('Autoplay blocked:', err);
        });
      };

      viewerVideoEl.src = src;
      viewerVideoEl.load();
    } else {
      viewerVideoEl.pause();
      viewerVideoEl.currentTime = 0;
      viewerVideoEl.onloadeddata = null;
      viewerVideoEl.removeAttribute('src');
      viewerVideoEl.load();
      viewerVideoEl.classList.add('hidden');
      viewerVideoEl.style.transform = 'scale(1)';

      viewerImgEl.src = src;
      viewerImgEl.alt = item.name;
      viewerImgEl.classList.remove('hidden');
      viewerImgEl.style.transform = 'scale(1)';
    }

    setZoom(1);
  }

  function stopThumbWarm() {
  if (!folder) return;

  fetch('/api/folder-stop-warm-thumbs?folder=' + encodeURIComponent(folder), {
    method: 'POST',
    keepalive: true
  }).catch((err) => {
    console.warn('Failed to stop thumb warm-up:', err);
  });
}

window.addEventListener('pagehide', stopThumbWarm);
window.addEventListener('beforeunload', stopThumbWarm);

  function setZoom(value) {
    const item = displayedMedia[currentIndex];
    zoom = Math.max(0.2, Math.min(5, value));

    if (item?.type === 'image') {
      viewerImgEl.style.transform = `scale(${zoom})`;
    } else {
      viewerVideoEl.style.transform = `scale(${zoom})`;
    }
  }

  function renderMasonry(items, folder, sortValue, gridEl) {
    const sorted = sortItems(items, sortValue);
    displayedMedia = sorted;

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

    sorted.forEach((item, index) => {
      const shortestIndex = heights.indexOf(Math.min(...heights));

      const gridSrc =
        item.type === 'image'
          ? '/thumb?folder=' + encodeURIComponent(folder) + '&file=' + encodeURIComponent(item.name)
          : '/media?folder=' + encodeURIComponent(folder) + '&file=' + encodeURIComponent(item.name);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'image-tile folder-image-button';
      button.addEventListener('click', () => openViewer(index));

      if (item.type === 'video') {
        const videoWrap = document.createElement('div');
        videoWrap.className = 'video-thumb-wrap';

        const video = document.createElement('video');
        video.className = 'video-thumb';
        video.src = gridSrc;
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const badge = document.createElement('div');
        badge.className = 'video-badge';
        badge.textContent = '▶';

        videoWrap.appendChild(video);
        videoWrap.appendChild(badge);
        button.appendChild(videoWrap);
      } else {
        const img = document.createElement('img');
        img.src = gridSrc;
        img.alt = item.name;
        img.loading = 'lazy';
        button.appendChild(img);
      }

      columns[shortestIndex].appendChild(button);

      const ratio = item.width && item.height ? item.height / item.width : 1.4;
      heights[shortestIndex] += ratio;
    });
  }
});

function sortItems(items, sortValue) {
  const arr = [...items];

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