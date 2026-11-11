/**
 * Menlo Park Time Machine — Historical Google Maps Photo Atlas
 * Interactive Map & Photo Viewer Application Logic
 */

(function () {
  'use strict';

  const dataset = window.ALBUM_DATA || { photos: [], locations: [] };
  const allPhotos = dataset.photos || [];

  // Application State
  const state = {
    pinMode: 'all', // 'all' (439 pins) | 'landmark' (83 grouped coordinate pins)
    mapLayer: 'm', // 'm' (Road), 'y' (Hybrid), 's' (Satellite), 'p' (Terrain)
    selectedEra: 'all',
    searchQuery: '',
    filteredPhotos: [...allPhotos],
    selectedPhotoId: null,
    activeContextList: [], // List of photos currently navigable via Prev/Next in modal
    sidebarCollapsed: false,
  };

  // DOM Elements
  const dom = {
    headerSummaryText: document.getElementById('header-summary-text'),
    allPinsCount: document.getElementById('all-pins-count'),
    landmarkPinsCount: document.getElementById('landmark-pins-count'),
    modeAllPinsBtn: document.getElementById('mode-all-pins-btn'),
    modeClusteredBtn: document.getElementById('mode-clustered-btn'),
    randomPhotoBtn: document.getElementById('random-photo-btn'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
    sidebarToggleLabel: document.getElementById('sidebar-toggle-label'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    eraPills: document.getElementById('era-pills'),
    visiblePhotoCount: document.getElementById('visible-photo-count'),
    jumpMenloPark: document.getElementById('jump-menlo-park'),
    jumpIreland: document.getElementById('jump-ireland'),
    photoFeed: document.getElementById('photo-feed'),
    layerBtns: document.querySelectorAll('.gmaps-layer-btn'),

    // Photo Inspector Modal
    modalBackdrop: document.getElementById('photo-inspector-backdrop'),
    modalCloseBtn: document.getElementById('inspector-close-btn'),
    modalPrevBtn: document.getElementById('modal-prev-btn'),
    modalNextBtn: document.getElementById('modal-next-btn'),
    stageCounterPill: document.getElementById('stage-counter-pill'),
    inspectorImg: document.getElementById('inspector-img'),
    inspectorYearBadge: document.getElementById('inspector-year-badge'),
    inspectorCatalogBadge: document.getElementById('inspector-catalog-badge'),
    inspectorTitle: document.getElementById('inspector-title'),
    inspectorNotes: document.getElementById('inspector-notes'),
    inspectorCoords: document.getElementById('inspector-coords'),
    inspectorFilename: document.getElementById('inspector-filename'),
    inspectorDimensions: document.getElementById('inspector-dimensions'),
    inspectorColocatedCount: document.getElementById('inspector-colocated-count'),
    inspectorStreetViewLink: document.getElementById('inspector-streetview-link'),
    inspectorGmapsLink: document.getElementById('inspector-gmaps-link'),
    inspectorGphotosLink: document.getElementById('inspector-gphotos-link'),
    inspectorDownloadLink: document.getElementById('inspector-download-link'),
    filmstripBar: document.getElementById('inspector-filmstrip-bar'),
    filmstripLabel: document.getElementById('filmstrip-label'),
    filmstripTrack: document.getElementById('filmstrip-track'),
  };

  // Map instance & Layers
  let map = null;
  let googleTileLayer = null;
  let markersLayerGroup = null;
  let leaderLineLayer = null;
  const markerByPhotoId = new Map();

  // Era bucket helper
  function getEraKey(year) {
    if (!year) return 'unknown';
    if (year < 1900) return '1800s';
    if (year < 1920) return '1900s';
    if (year < 1940) return '1920s';
    if (year < 1960) return '1940s';
    if (year < 1980) return '1960s';
    return '1980s';
  }

  function getEraColor(year) {
    const era = getEraKey(year);
    switch (era) {
      case '1800s':
        return 'hsl(14, 78%, 48%)';
      case '1900s':
        return 'hsl(28, 84%, 46%)';
      case '1920s':
        return 'hsl(42, 88%, 42%)';
      case '1940s':
        return 'hsl(168, 68%, 36%)';
      case '1960s':
        return 'hsl(208, 78%, 46%)';
      case '1980s':
        return 'hsl(225, 65%, 48%)';
      default:
        return 'hsl(4, 82%, 56%)';
    }
  }

  // Build Google Maps SVG Pin HTML
  function createPinIcon(photo, isSelected, clusterCount) {
    const fillColor = isSelected ? 'hsl(214, 89%, 52%)' : getEraColor(photo.year);
    const strokeColor = '#ffffff';
    const badgeHtml =
      clusterCount && clusterCount > 1
        ? `<span class="pin-cluster-badge">${clusterCount}</span>`
        : '';

    const html = `
      <div class="gmap-pin ${isSelected ? 'selected' : ''}" data-photo-id="${photo.id}">
        <svg viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M14 1.5C7.1 1.5 1.5 7.1 1.5 14C1.5 22.9 14 36.2 14 36.2C14 36.2 26.5 22.9 26.5 14C26.5 7.1 20.9 1.5 14 1.5Z"
            fill="${fillColor}"
            stroke="${strokeColor}"
            stroke-width="2"
          />
          <circle cx="14" cy="14" r="4.8" fill="#ffffff" />
        </svg>
        ${badgeHtml}
      </div>
    `;

    return L.divIcon({
      className: 'gmap-pin-wrapper',
      html,
      iconSize: [28, 38],
      iconAnchor: [14, 37],
      tooltipAnchor: [0, -34],
    });
  }

  // Build Rich Hover Tooltip Content
  function createTooltipHtml(photo, clusterCount) {
    const countText =
      clusterCount && clusterCount > 1
        ? `${clusterCount} photos at this spot`
        : photo.catalogId
        ? `#${photo.catalogId}`
        : '';
    return `
      <div class="pin-tooltip-card">
        <img class="pin-tooltip-img" src="${photo.thumbUrl}" alt="${escapeHtml(photo.title)}" loading="lazy" />
        <div class="pin-tooltip-meta">
          <span>${escapeHtml(photo.yearLabel || 'Historical')}</span>
          <span>${escapeHtml(countText)}</span>
        </div>
        <div class="pin-tooltip-title">${escapeHtml(photo.title)}</div>
        <div class="pin-tooltip-hint">Click pin to view photo</div>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initialize Leaflet Map with Google Maps Tiles
  function initMap() {
    map = L.map('map', {
      center: [37.4529, -122.1842],
      zoom: 15,
      zoomControl: false,
      maxZoom: 21,
      minZoom: 3,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    setGoogleTileLayer(state.mapLayer);

    markersLayerGroup = L.layerGroup().addTo(map);
    leaderLineLayer = L.layerGroup().addTo(map);
  }

  function setGoogleTileLayer(lyrsCode) {
    state.mapLayer = lyrsCode;
    if (googleTileLayer) {
      map.removeLayer(googleTileLayer);
    }
    googleTileLayer = L.tileLayer(
      `https://mt{s}.google.com/vt/lyrs=${lyrsCode}&x={x}&y={y}&z={z}`,
      {
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 21,
        attribution: '&copy; Google Maps · Menlo Park Historical Photo Archive',
      }
    ).addTo(map);

    dom.layerBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layer === lyrsCode);
    });
  }

  // Filter Photos based on Search Query & Era Selection
  function applyFilters() {
    const q = state.searchQuery.trim().toLowerCase();
    const era = state.selectedEra;

    state.filteredPhotos = allPhotos.filter((p) => {
      if (era !== 'all' && getEraKey(p.year) !== era) {
        return false;
      }
      if (q) {
        const haystack = `${p.title} ${p.notes} ${p.catalogId || ''} ${p.yearLabel || ''} ${p.filename || ''}`.toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }
      return true;
    });

    // Count unique locations in filtered set
    const uniqueLocs = new Set(state.filteredPhotos.map((p) => `${p.lat},${p.lng}`));
    dom.allPinsCount.textContent = state.filteredPhotos.length;
    dom.landmarkPinsCount.textContent = uniqueLocs.size;
    dom.visiblePhotoCount.textContent = state.filteredPhotos.length;

    renderMapPins();
    renderPhotoFeed();
  }

  // Render Google Maps Pins
  function renderMapPins() {
    markersLayerGroup.clearLayers();
    leaderLineLayer.clearLayers();
    markerByPhotoId.clear();

    if (state.pinMode === 'all') {
      // Drop 1 pin for each individual geolocated photo
      state.filteredPhotos.forEach((photo) => {
        const isSelected = photo.id === state.selectedPhotoId;
        const lat = photo.displayLat || photo.lat;
        const lng = photo.displayLng || photo.lng;

        const marker = L.marker([lat, lng], {
          icon: createPinIcon(photo, isSelected, 1),
          zIndexOffset: isSelected ? 1000 : 0,
        });

        marker.bindTooltip(() => createTooltipHtml(photo, 1), {
          direction: 'top',
          className: 'pin-hover-tooltip',
          opacity: 1,
        });

        marker.on('click', () => {
          // When clicking a pin, show the photo immediately and populate its co-located group
          const colocated = state.filteredPhotos.filter(
            (p) => p.lat === photo.lat && p.lng === photo.lng
          );
          openPhotoModal(photo, colocated.length > 1 ? colocated : state.filteredPhotos);
        });

        marker.on('mouseover', () => {
          drawLeaderLine(photo);
        });

        marker.on('mouseout', () => {
          if (state.selectedPhotoId !== photo.id) {
            leaderLineLayer.clearLayers();
          }
        });

        marker.addTo(markersLayerGroup);
        markerByPhotoId.set(photo.id, marker);
      });
    } else {
      // Group co-located photos by exact GPS coordinate (83 landmarks)
      const groups = new Map();
      state.filteredPhotos.forEach((photo) => {
        const key = `${photo.lat},${photo.lng}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key).push(photo);
      });

      groups.forEach((groupPhotos) => {
        const leadPhoto =
          groupPhotos.find((p) => p.id === state.selectedPhotoId) || groupPhotos[0];
        const isSelected = groupPhotos.some((p) => p.id === state.selectedPhotoId);

        const marker = L.marker([leadPhoto.lat, leadPhoto.lng], {
          icon: createPinIcon(leadPhoto, isSelected, groupPhotos.length),
          zIndexOffset: isSelected ? 1000 : groupPhotos.length * 5,
        });

        marker.bindTooltip(() => createTooltipHtml(leadPhoto, groupPhotos.length), {
          direction: 'top',
          className: 'pin-hover-tooltip',
          opacity: 1,
        });

        marker.on('click', () => {
          openPhotoModal(leadPhoto, groupPhotos);
        });

        marker.addTo(markersLayerGroup);
        groupPhotos.forEach((p) => markerByPhotoId.set(p.id, marker));
      });
    }
  }

  // Draw a subtle dashed connector line from the spiral-offset pin to its exact GPS anchor
  function drawLeaderLine(photo) {
    leaderLineLayer.clearLayers();
    if (
      state.pinMode === 'all' &&
      photo.displayLat &&
      (photo.displayLat !== photo.lat || photo.displayLng !== photo.lng)
    ) {
      L.polyline(
        [
          [photo.lat, photo.lng],
          [photo.displayLat, photo.displayLng],
        ],
        {
          color: 'hsl(214, 89%, 52%)',
          weight: 2,
          dashArray: '4, 4',
          opacity: 0.85,
        }
      ).addTo(leaderLineLayer);

      L.circleMarker([photo.lat, photo.lng], {
        radius: 4,
        color: '#ffffff',
        weight: 1.5,
        fillColor: 'hsl(214, 89%, 52%)',
        fillOpacity: 1,
      }).addTo(leaderLineLayer);
    }
  }

  // Render Left Sidebar Photo Feed
  function renderPhotoFeed() {
    dom.photoFeed.innerHTML = '';

    if (state.filteredPhotos.length === 0) {
      dom.photoFeed.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          No geolocated photos match your current filter.
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    state.filteredPhotos.forEach((photo) => {
      const card = document.createElement('article');
      card.className = `photo-card ${photo.id === state.selectedPhotoId ? 'selected' : ''}`;
      card.dataset.photoId = photo.id;
      card.setAttribute('role', 'listitem');

      const colocatedCount = photo.locationCount || 1;
      const colocatedBadge =
        colocatedCount > 1
          ? `<span class="colocated-tag" title="${colocatedCount} photos share this exact GPS coordinate">${colocatedCount} at spot</span>`
          : `<span>${photo.lat.toFixed(4)}, ${photo.lng.toFixed(4)}</span>`;

      card.innerHTML = `
        <div class="photo-card-thumb-wrap">
          <img
            class="photo-card-thumb"
            src="${photo.thumbUrl}"
            alt="${escapeHtml(photo.title)}"
            loading="lazy"
          />
          <span class="photo-card-year-badge">${escapeHtml(photo.yearLabel)}</span>
        </div>
        <div class="photo-card-body">
          <div>
            <h3 class="photo-card-title">${escapeHtml(photo.title)}</h3>
            ${
              photo.notes
                ? `<p class="photo-card-notes">${escapeHtml(photo.notes)}</p>`
                : ''
            }
          </div>
          <div class="photo-card-meta">
            ${
              photo.catalogId
                ? `<span class="catalog-tag">#${escapeHtml(photo.catalogId)}</span>`
                : '<span></span>'
            }
            ${colocatedBadge}
          </div>
        </div>
      `;

      card.addEventListener('mouseenter', () => {
        highlightPinOnMap(photo, true);
      });

      card.addEventListener('mouseleave', () => {
        highlightPinOnMap(photo, false);
      });

      card.addEventListener('click', () => {
        focusPhotoOnMapAndOpen(photo);
      });

      fragment.appendChild(card);
    });

    dom.photoFeed.appendChild(fragment);
  }

  function highlightPinOnMap(photo, isHovered) {
    const marker = markerByPhotoId.get(photo.id);
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;
    const pin = el.querySelector('.gmap-pin');
    if (pin) {
      pin.classList.toggle('hovered', isHovered);
    }
    if (isHovered) {
      drawLeaderLine(photo);
    } else if (state.selectedPhotoId !== photo.id) {
      leaderLineLayer.clearLayers();
    }
  }

  function focusPhotoOnMapAndOpen(photo) {
    const targetLat = state.pinMode === 'all' ? photo.displayLat || photo.lat : photo.lat;
    const targetLng = state.pinMode === 'all' ? photo.displayLng || photo.lng : photo.lng;
    const targetZoom = Math.max(map.getZoom(), 17);

    map.flyTo([targetLat, targetLng], targetZoom, {
      duration: 0.65,
    });

    const colocated = state.filteredPhotos.filter(
      (p) => p.lat === photo.lat && p.lng === photo.lng
    );
    openPhotoModal(photo, colocated.length > 1 ? colocated : state.filteredPhotos);
  }

  // Open Photo Inspector Lightbox when clicking a pin or photo card
  function openPhotoModal(photo, contextList) {
    state.selectedPhotoId = photo.id;
    state.activeContextList =
      contextList && contextList.length > 0 ? contextList : state.filteredPhotos;

    // Update selected state in sidebar cards and map pins
    document.querySelectorAll('.photo-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.photoId === photo.id);
    });
    renderMapPins();
    drawLeaderLine(photo);

    // Populate modal fields
    const currentIndex = state.activeContextList.findIndex((p) => p.id === photo.id);
    const totalInContext = state.activeContextList.length;

    dom.stageCounterPill.textContent = `${currentIndex + 1} / ${totalInContext}`;

    // Show preview immediately, then upgrade to high-res
    dom.inspectorImg.classList.remove('zoomed');
    dom.inspectorImg.src = photo.previewUrl;
    dom.inspectorImg.alt = photo.title;
    const fullImg = new Image();
    fullImg.onload = () => {
      if (state.selectedPhotoId === photo.id) {
        dom.inspectorImg.src = photo.fullUrl;
      }
    };
    fullImg.src = photo.fullUrl;

    dom.inspectorYearBadge.textContent = photo.yearLabel || 'Historical';
    if (photo.catalogId) {
      dom.inspectorCatalogBadge.style.display = 'inline-block';
      dom.inspectorCatalogBadge.textContent = `Archive #${photo.catalogId}`;
    } else {
      dom.inspectorCatalogBadge.style.display = 'none';
    }

    dom.inspectorTitle.textContent = photo.title;

    if (photo.notes) {
      dom.inspectorNotes.style.display = 'block';
      dom.inspectorNotes.textContent = photo.notes;
    } else {
      dom.inspectorNotes.style.display = 'none';
    }

    dom.inspectorCoords.textContent = `${photo.lat.toFixed(6)}, ${photo.lng.toFixed(6)}`;
    dom.inspectorFilename.textContent = photo.filename || 'N/A';
    dom.inspectorDimensions.textContent = `${photo.width} × ${photo.height} px`;

    // All photos sharing this exact GPS coordinate
    const sameSpotPhotos = allPhotos.filter(
      (p) => p.lat === photo.lat && p.lng === photo.lng
    );
    dom.inspectorColocatedCount.textContent =
      sameSpotPhotos.length === 1
        ? '1 photo at this spot'
        : `${sameSpotPhotos.length} photos at this spot`;

    dom.inspectorStreetViewLink.href = photo.streetViewUrl;
    dom.inspectorGmapsLink.href = photo.googleMapsUrl;
    dom.inspectorGphotosLink.href = photo.albumPhotoUrl;
    dom.inspectorDownloadLink.href = photo.fullUrl;

    // Populate bottom filmstrip for co-located photos (or active context)
    const filmstripPhotos = sameSpotPhotos.length > 1 ? sameSpotPhotos : state.activeContextList;
    dom.filmstripLabel.textContent =
      sameSpotPhotos.length > 1
        ? `At this exact location (${sameSpotPhotos.length}):`
        : `Browse photos (${filmstripPhotos.length}):`;

    dom.filmstripTrack.innerHTML = '';
    filmstripPhotos.slice(0, 60).forEach((item) => {
      const thumbBtn = document.createElement('button');
      thumbBtn.type = 'button';
      thumbBtn.className = `filmstrip-item ${item.id === photo.id ? 'active' : ''}`;
      thumbBtn.title = `${item.yearLabel} — ${item.title}`;
      thumbBtn.innerHTML = `
        <img src="${item.thumbUrl}" alt="${escapeHtml(item.title)}" loading="lazy" />
        <span class="filmstrip-year">${escapeHtml(String(item.year || ''))}</span>
      `;
      thumbBtn.addEventListener('click', () => {
        openPhotoModal(item, filmstripPhotos);
      });
      dom.filmstripTrack.appendChild(thumbBtn);
    });

    dom.modalBackdrop.classList.add('open');

    // Scroll active filmstrip thumbnail into view
    const activeThumb = dom.filmstripTrack.querySelector('.filmstrip-item.active');
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  function closePhotoModal() {
    dom.modalBackdrop.classList.remove('open');
    dom.inspectorImg.classList.remove('zoomed');
  }

  function stepModalPhoto(delta) {
    if (!state.modalOpen && !dom.modalBackdrop.classList.contains('open')) return;
    const list = state.activeContextList;
    if (!list || list.length === 0) return;
    const idx = list.findIndex((p) => p.id === state.selectedPhotoId);
    const nextIdx = (idx + delta + list.length) % list.length;
    const nextPhoto = list[nextIdx];
    if (nextPhoto) {
      openPhotoModal(nextPhoto, list);
      const targetLat =
        state.pinMode === 'all' ? nextPhoto.displayLat || nextPhoto.lat : nextPhoto.lat;
      const targetLng =
        state.pinMode === 'all' ? nextPhoto.displayLng || nextPhoto.lng : nextPhoto.lng;
      map.panTo([targetLat, targetLng], { animate: true });
    }
  }

  // Bind UI Events
  function bindEvents() {
    // Pin Mode Switcher (All 439 Photo Pins vs 83 Landmark Clusters)
    dom.modeAllPinsBtn.addEventListener('click', () => {
      if (state.pinMode === 'all') return;
      state.pinMode = 'all';
      dom.modeAllPinsBtn.classList.add('active');
      dom.modeClusteredBtn.classList.remove('active');
      renderMapPins();
    });

    dom.modeClusteredBtn.addEventListener('click', () => {
      if (state.pinMode === 'landmark') return;
      state.pinMode = 'landmark';
      dom.modeClusteredBtn.classList.add('active');
      dom.modeAllPinsBtn.classList.remove('active');
      renderMapPins();
    });

    // Random Photo Button
    dom.randomPhotoBtn.addEventListener('click', () => {
      const pool = state.filteredPhotos.length > 0 ? state.filteredPhotos : allPhotos;
      if (pool.length === 0) return;
      const randomPhoto = pool[Math.floor(Math.random() * pool.length)];
      focusPhotoOnMapAndOpen(randomPhoto);
    });

    // Sidebar Toggle
    dom.sidebarToggleBtn.addEventListener('click', () => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      dom.sidebar.classList.toggle('collapsed', state.sidebarCollapsed);
      dom.sidebarToggleLabel.textContent = state.sidebarCollapsed ? 'Show List' : 'Hide List';
      setTimeout(() => {
        map.invalidateSize();
      }, 280);
    });

    // Search Input
    dom.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      dom.clearSearchBtn.classList.toggle('visible', state.searchQuery.length > 0);
      applyFilters();
    });

    dom.clearSearchBtn.addEventListener('click', () => {
      state.searchQuery = '';
      dom.searchInput.value = '';
      dom.clearSearchBtn.classList.remove('visible');
      applyFilters();
    });

    // Era Filter Pills
    dom.eraPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.era-pill');
      if (!pill) return;
      state.selectedEra = pill.dataset.era;
      dom.eraPills.querySelectorAll('.era-pill').forEach((p) => {
        p.classList.toggle('active', p === pill);
      });
      applyFilters();
    });

    // Region Quick Jumps
    dom.jumpMenloPark.addEventListener('click', () => {
      map.flyTo([37.4529, -122.1842], 15, { duration: 0.8 });
    });

    dom.jumpIreland.addEventListener('click', () => {
      map.flyTo([53.3043, -9.0729194], 16, { duration: 0.9 });
    });

    // Google Maps Layer Switcher
    dom.layerBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        setGoogleTileLayer(btn.dataset.layer);
      });
    });

    // Modal Controls
    dom.modalCloseBtn.addEventListener('click', closePhotoModal);
    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop) {
        closePhotoModal();
      }
    });

    dom.modalPrevBtn.addEventListener('click', () => stepModalPhoto(-1));
    dom.modalNextBtn.addEventListener('click', () => stepModalPhoto(1));

    dom.inspectorImg.addEventListener('click', () => {
      dom.inspectorImg.classList.toggle('zoomed');
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (!dom.modalBackdrop.classList.contains('open')) return;
      if (e.key === 'Escape') {
        closePhotoModal();
      } else if (e.key === 'ArrowLeft') {
        stepModalPhoto(-1);
      } else if (e.key === 'ArrowRight') {
        stepModalPhoto(1);
      }
    });
  }

  // Bootstrap Application
  function init() {
    initMap();
    bindEvents();
    applyFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
