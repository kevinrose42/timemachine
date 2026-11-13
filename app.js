/**
 * Historical Photo Time Machine — Menlo Park & Santa Cruz Google Maps Photo Atlas
 * Interactive Map, Multi-Album Filter & JSON Info Blob Viewer Application Logic
 */

(function () {
  'use strict';

  const dataset = window.ALBUM_DATA || { photos: [], locations: [], albums: [] };
  const allPhotos = dataset.photos || [];
  const albumBySlug = new Map((dataset.albums || []).map((a) => [a.slug, a]));

  // Hydrate derived URLs and search index on startup
  allPhotos.forEach((p) => {
    const alb = albumBySlug.get(p.album) || {};
    if (!p.album) p.album = 'menlo-park';
    if (!p.albumTitle) p.albumTitle = alb.title || 'Menlo Park Historical Photo Archive';
    if (!p.albumShortTitle) p.albumShortTitle = alb.shortTitle || 'Menlo Park';
    if (!p.albumShortUrl) p.albumShortUrl = alb.shortUrl || 'https://photos.app.goo.gl/jRkKPneBYiDHSSpYA';

    if (p.baseUrl) {
      if (!p.thumbUrl) p.thumbUrl = `${p.baseUrl}=w360-h270-c`;
      if (!p.previewUrl) p.previewUrl = `${p.baseUrl}=w800`;
      if (!p.fullUrl) p.fullUrl = `${p.baseUrl}=w1600`;
      if (!p.downloadUrl) p.downloadUrl = `${p.baseUrl}=d`;
    }
    if (!p.albumPhotoUrl && alb.albumId && alb.albumKey) {
      p.albumPhotoUrl = `https://photos.google.com/share/${alb.albumId}/photo/${p.id}?key=${alb.albumKey}`;
    }
    if (p.lat != null && p.lng != null) {
      if (!p.googleMapsUrl) {
        p.googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
      }
      if (!p.streetViewUrl) {
        p.streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}`;
      }
    }

    // Build searchable text including JSON info blob fields
    const info = p.info || {};
    const tagsStr = Array.isArray(info.tags) ? info.tags.join(' ') : '';
    const subjectsStr = Array.isArray(info.subjects) ? info.subjects.join(' ') : '';
    p._searchText = [
      p.title,
      p.notes,
      p.catalogId,
      p.yearLabel,
      p.filename,
      p.locationName,
      p.albumShortTitle,
      info.coverage,
      info.creator,
      info.source,
      info.collection,
      info.relation,
      info.publisher,
      tagsStr,
      subjectsStr,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  });

  const FEED_PAGE_SIZE = 80;

  // Application State
  const state = {
    selectedAlbum: 'all', // 'all' | 'menlo-park' | 'santa-cruz'
    pinMode: 'all', // 'all' (individual photo pins) | 'landmark' (grouped coordinate pins)
    mapLayer: 'm', // 'm' (Road), 'y' (Hybrid), 's' (Satellite), 'p' (Terrain)
    selectedEra: 'all',
    searchQuery: '',
    filteredPhotos: [...allPhotos],
    feedRenderLimit: FEED_PAGE_SIZE,
    selectedPhotoId: null,
    activeContextList: [],
    sidebarCollapsed: false,
  };

  // DOM Elements
  const dom = {
    headerSummaryText: document.getElementById('header-summary-text'),
    albumFilterControl: document.getElementById('album-filter-control'),
    albumAllCount: document.getElementById('album-all-count'),
    albumMpCount: document.getElementById('album-mp-count'),
    albumScCount: document.getElementById('album-sc-count'),
    albumPcCount: document.getElementById('album-pc-count'),
    albumSsCount: document.getElementById('album-ss-count'),
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
    jumpSantaCruz: document.getElementById('jump-santa-cruz'),
    jumpBoulderCreek: document.getElementById('jump-boulder-creek'),
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
    inspectorAlbumBadge: document.getElementById('inspector-album-badge'),
    inspectorYearBadge: document.getElementById('inspector-year-badge'),
    inspectorCatalogBadge: document.getElementById('inspector-catalog-badge'),
    inspectorTitle: document.getElementById('inspector-title'),
    inspectorNotes: document.getElementById('inspector-notes'),
    inspectorTaxonomy: document.getElementById('inspector-taxonomy'),
    inspectorJsonInfoSection: document.getElementById('inspector-json-info-section'),
    inspectorJsonFields: document.getElementById('inspector-json-fields'),
    inspectorRawJsonDetails: document.getElementById('inspector-raw-json-details'),
    inspectorRawJsonPre: document.getElementById('inspector-raw-json-pre'),
    inspectorCoords: document.getElementById('inspector-coords'),
    inspectorLocationName: document.getElementById('inspector-location-name'),
    inspectorFilename: document.getElementById('inspector-filename'),
    inspectorDimensions: document.getElementById('inspector-dimensions'),
    inspectorColocatedCount: document.getElementById('inspector-colocated-count'),
    inspectorArchiveLinksRow: document.getElementById('inspector-archive-links-row'),
    inspectorItemPageLink: document.getElementById('inspector-item-page-link'),
    inspectorOriginalScanLink: document.getElementById('inspector-original-scan-link'),
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
  let feedObserver = null;

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
          <circle cx="14" cy="13.5" r="4.8" fill="#ffffff" />
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

  // Build Hover Tooltip Preview Card
  function createTooltipHtml(photo, clusterCount) {
    const countLabel =
      clusterCount && clusterCount > 1 ? `${clusterCount} photos here` : photo.albumShortTitle || '';
    const codeLabel = photo.catalogId ? `#${escapeHtml(photo.catalogId)}` : '';
    const rightMeta = countLabel || codeLabel;
    const coverageLine =
      photo.info && photo.info.coverage
        ? `<div style="font-size: 0.68rem; color: var(--text-secondary);">${escapeHtml(photo.info.coverage)}</div>`
        : '';

    return `
      <div class="pin-tooltip-card">
        <img class="pin-tooltip-img" src="${photo.thumbUrl}" alt="${escapeHtml(photo.title)}" loading="lazy" />
        <div class="pin-tooltip-meta">
          <span>${escapeHtml(photo.yearLabel)}</span>
          <span>${escapeHtml(rightMeta)}</span>
        </div>
        <div class="pin-tooltip-title">${escapeHtml(photo.title)}</div>
        ${coverageLine}
        <div class="pin-tooltip-hint">Click pin to view photo &amp; info</div>
      </div>
    `;
  }

  // Initialize Leaflet Map with Official Google Maps Tiles
  function initMap() {
    // Center initially to show the Bay Area & Santa Cruz Peninsula
    map = L.map('map', {
      center: [37.21, -122.11],
      zoom: 10,
      zoomControl: false,
      preferCanvas: false,
    });

    L.control
      .zoom({
        position: 'bottomright',
      })
      .addTo(map);

    setGoogleTileLayer(state.mapLayer);

    leaderLineLayer = L.layerGroup().addTo(map);
    markersLayerGroup = L.layerGroup().addTo(map);
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
        attribution: '&copy; Google Maps · Menlo Park &amp; Santa Cruz Historical Archives',
      }
    ).addTo(map);

    dom.layerBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layer === lyrsCode);
    });
  }

  // Filter Photos based on Album, Search Query & Era Selection
  function applyFilters() {
    const q = state.searchQuery.trim().toLowerCase();
    const era = state.selectedEra;
    const album = state.selectedAlbum;

    state.filteredPhotos = allPhotos.filter((p) => {
      if (album !== 'all' && p.album !== album) {
        return false;
      }
      if (era !== 'all' && getEraKey(p.year) !== era) {
        return false;
      }
      if (q && !p._searchText.includes(q)) {
        return false;
      }
      return true;
    });

    state.feedRenderLimit = FEED_PAGE_SIZE;

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
      // Group co-located photos by exact GPS coordinate
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

  // Render Left Sidebar Photo Feed (Paginated for instant rendering across 2,655 photos)
  function renderPhotoFeed(appendOnly = false) {
    if (feedObserver) {
      feedObserver.disconnect();
      feedObserver = null;
    }

    if (!appendOnly) {
      dom.photoFeed.innerHTML = '';
    } else {
      const oldBtn = dom.photoFeed.querySelector('.feed-load-more-btn');
      if (oldBtn) oldBtn.remove();
    }

    if (state.filteredPhotos.length === 0) {
      dom.photoFeed.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          No geolocated photos match your current filter.
        </div>
      `;
      return;
    }

    const startIdx = appendOnly
      ? Math.max(0, state.feedRenderLimit - FEED_PAGE_SIZE)
      : 0;
    const endIdx = Math.min(state.feedRenderLimit, state.filteredPhotos.length);
    const slice = state.filteredPhotos.slice(startIdx, endIdx);

    const fragment = document.createDocumentFragment();

    slice.forEach((photo) => {
      const card = document.createElement('article');
      card.className = `photo-card ${photo.id === state.selectedPhotoId ? 'selected' : ''}`;
      card.dataset.photoId = photo.id;
      card.setAttribute('role', 'listitem');

      const colocatedCount = photo.locationCount || 1;
      const colocatedBadge =
        colocatedCount > 1
          ? `<span class="colocated-tag" title="${colocatedCount} photos share this exact GPS coordinate">${colocatedCount} at spot</span>`
          : `<span>${escapeHtml(photo.locationName || `${photo.lat.toFixed(4)}, ${photo.lng.toFixed(4)}`)}</span>`;

      const albumBadgeClass =
        photo.album === 'santa-cruz'
          ? 'santa-cruz'
          : photo.album === 'scpl-postcards'
            ? 'scpl-postcards'
            : photo.album === 'scpl-snapshots'
              ? 'scpl-snapshots'
              : '';
      const albumBadgeLabel =
        photo.album === 'santa-cruz'
          ? 'SCPL'
          : photo.album === 'scpl-postcards'
            ? 'POSTCARD'
            : photo.album === 'scpl-snapshots'
              ? 'SNAPSHOT'
              : 'MP';

      card.innerHTML = `
        <div class="photo-card-thumb-wrap">
          <img
            class="photo-card-thumb"
            src="${photo.thumbUrl}"
            alt="${escapeHtml(photo.title)}"
            loading="lazy"
          />
          <span class="photo-card-album-badge ${albumBadgeClass}">${albumBadgeLabel}</span>
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

    if (endIdx < state.filteredPhotos.length) {
      const remaining = state.filteredPhotos.length - endIdx;
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.type = 'button';
      loadMoreBtn.className = 'feed-load-more-btn';
      loadMoreBtn.textContent = `Show More Photos (${remaining} remaining)`;
      loadMoreBtn.addEventListener('click', () => {
        state.feedRenderLimit += FEED_PAGE_SIZE;
        renderPhotoFeed(true);
      });
      fragment.appendChild(loadMoreBtn);

      if ('IntersectionObserver' in window) {
        feedObserver = new IntersectionObserver(
          (entries) => {
            if (entries.some((e) => e.isIntersecting)) {
              state.feedRenderLimit += FEED_PAGE_SIZE;
              renderPhotoFeed(true);
            }
          },
          { root: dom.photoFeed, rootMargin: '240px' }
        );
        setTimeout(() => {
          if (feedObserver && loadMoreBtn.isConnected) {
            feedObserver.observe(loadMoreBtn);
          }
        }, 50);
      }
    }

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
    const targetZoom = Math.max(map.getZoom(), 16);

    map.flyTo([targetLat, targetLng], targetZoom, {
      duration: 0.65,
    });

    const colocated = state.filteredPhotos.filter(
      (p) => p.lat === photo.lat && p.lng === photo.lng
    );
    openPhotoModal(photo, colocated.length > 1 ? colocated : state.filteredPhotos);
  }

  // Render JSON Info Blob Metadata inside Modal
  function renderJsonInfoPanel(photo) {
    const info = photo.info;
    if (!info || typeof info !== 'object') {
      dom.inspectorTaxonomy.style.display = 'none';
      dom.inspectorTaxonomy.innerHTML = '';
      dom.inspectorJsonInfoSection.style.display = 'none';
      dom.inspectorJsonFields.innerHTML = '';
      dom.inspectorArchiveLinksRow.style.display = 'none';
      return;
    }

    // 1. Render Interactive Tags & Subjects Chips
    const tags = Array.isArray(info.tags) ? info.tags.filter(Boolean) : [];
    const subjects = Array.isArray(info.subjects) ? info.subjects.filter(Boolean) : [];

    if (tags.length > 0 || subjects.length > 0) {
      dom.inspectorTaxonomy.style.display = 'flex';
      dom.inspectorTaxonomy.innerHTML = '';

      if (tags.length > 0) {
        const group = document.createElement('div');
        group.className = 'tax-group';
        group.innerHTML = `<span class="tax-label">Tags:</span>`;
        tags.forEach((tag) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tax-chip';
          btn.title = `Filter map to tag "${tag}"`;
          btn.textContent = tag;
          btn.addEventListener('click', () => {
            filterByTermFromModal(tag);
          });
          group.appendChild(btn);
        });
        dom.inspectorTaxonomy.appendChild(group);
      }

      if (subjects.length > 0) {
        const group = document.createElement('div');
        group.className = 'tax-group';
        group.innerHTML = `<span class="tax-label">Subjects:</span>`;
        subjects.forEach((subj) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tax-chip';
          btn.title = `Filter map to subject "${subj}"`;
          btn.textContent = subj;
          btn.addEventListener('click', () => {
            filterByTermFromModal(subj);
          });
          group.appendChild(btn);
        });
        dom.inspectorTaxonomy.appendChild(group);
      }
    } else {
      dom.inspectorTaxonomy.style.display = 'none';
      dom.inspectorTaxonomy.innerHTML = '';
    }

    // 2. Render Structured JSON Fields
    const fieldDefinitions = [
      { key: 'identifier', label: 'Identifier' },
      { key: 'date', label: 'Date' },
      { key: 'year_confidence', label: 'Year Confidence' },
      { key: 'how_year_was_determined', label: 'How Year Was Determined' },
      { key: 'coverage', label: 'Coverage / Place' },
      { key: 'location_confidence', label: 'Location Confidence' },
      { key: 'how_location_was_determined', label: 'How Location Was Determined' },
      { key: 'creator', label: 'Creator' },
      { key: 'source', label: 'Source / Donor' },
      { key: 'collection', label: 'Collection' },
      { key: 'publisher', label: 'Publisher' },
      { key: 'relation', label: 'Relation' },
      { key: 'type', label: 'Record Type' },
      { key: 'item_type', label: 'Item Type' },
      { key: 'original_format', label: 'Original Format' },
      { key: 'format', label: 'Format' },
      { key: 'physical_dimensions', label: 'Physical Size' },
      {
        key: 'dimensions',
        label: 'Scan Dimensions',
        format: (val) =>
          val && typeof val === 'object'
            ? val.display || `${val.width || '?'} × ${val.height || '?'}`
            : String(val),
      },
      { key: 'item_id', label: 'Catalog Item ID' },
      { key: 'page', label: 'Catalog Page' },
      {
        key: 'file_index',
        label: 'File Index',
        format: (val, obj) => (obj.file_count ? `${val} of ${obj.file_count}` : String(val)),
      },
      { key: 'language', label: 'Language' },
      { key: 'rights', label: 'Rights / Usage' },
      { key: 'citation', label: 'Citation' },
      {
        key: 'item_page_url',
        label: 'Catalog URL',
        isUrl: true,
      },
      {
        key: 'original_image_url',
        label: 'Original Image',
        isUrl: true,
      },
    ];

    const handledKeys = new Set([
      'title',
      'description',
      'tags',
      'subjects',
      'file_count',
      'square_thumbnail_url',
      ...fieldDefinitions.map((f) => f.key),
    ]);

    const rowsHtml = [];
    fieldDefinitions.forEach((def) => {
      const rawVal = info[def.key];
      if (rawVal === undefined || rawVal === null || rawVal === '') return;
      const displayVal = def.format ? def.format(rawVal, info) : String(rawVal);
      if (!displayVal) return;

      const valueHtml = def.isUrl
        ? `<a href="${escapeHtml(displayVal)}" target="_blank" rel="noopener noreferrer">${escapeHtml(displayVal)} ↗</a>`
        : escapeHtml(displayVal);

      rowsHtml.push(`
        <div class="json-field-row">
          <div class="json-field-key">${escapeHtml(def.label)}</div>
          <div class="json-field-val">${valueHtml}</div>
        </div>
      `);
    });

    // Include any additional custom keys from the JSON blob
    Object.keys(info).forEach((k) => {
      if (handledKeys.has(k)) return;
      const val = info[k];
      if (val === undefined || val === null || val === '') return;
      const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
      rowsHtml.push(`
        <div class="json-field-row">
          <div class="json-field-key">${escapeHtml(k)}</div>
          <div class="json-field-val">${escapeHtml(strVal)}</div>
        </div>
      `);
    });

    dom.inspectorJsonFields.innerHTML = rowsHtml.join('');
    dom.inspectorRawJsonDetails.open = false;
    dom.inspectorRawJsonPre.textContent = JSON.stringify(info, null, 2);
    dom.inspectorJsonInfoSection.style.display = 'block';

    // 3. External Archive Action Buttons (item_page_url & original_image_url)
    if (info.item_page_url || info.original_image_url) {
      dom.inspectorArchiveLinksRow.style.display = 'grid';
      if (info.item_page_url) {
        dom.inspectorItemPageLink.href = info.item_page_url;
        dom.inspectorItemPageLink.style.display = 'inline-flex';
      } else {
        dom.inspectorItemPageLink.style.display = 'none';
      }
      if (info.original_image_url) {
        dom.inspectorOriginalScanLink.href = info.original_image_url;
        dom.inspectorOriginalScanLink.style.display = 'inline-flex';
      } else {
        dom.inspectorOriginalScanLink.style.display = 'none';
      }
    } else {
      dom.inspectorArchiveLinksRow.style.display = 'none';
    }
  }

  function filterByTermFromModal(term) {
    closePhotoModal();
    state.searchQuery = term;
    dom.searchInput.value = term;
    dom.clearSearchBtn.classList.add('visible');
    applyFilters();
  }

  // Open Photo Lightbox / Detail Inspector Modal
  function openPhotoModal(photo, contextList) {
    state.selectedPhotoId = photo.id;
    state.activeContextList =
      contextList && contextList.length > 0 ? contextList : state.filteredPhotos;

    const currentIndex = state.activeContextList.findIndex((p) => p.id === photo.id);
    const totalInContext = state.activeContextList.length;

    dom.stageCounterPill.textContent = `${currentIndex >= 0 ? currentIndex + 1 : 1} / ${totalInContext}`;

    // Load preview image immediately, then upgrade to high-res
    dom.inspectorImg.classList.remove('zoomed');
    dom.inspectorImg.src = photo.previewUrl || photo.fullUrl;
    dom.inspectorImg.alt = photo.title;

    const hiRes = new Image();
    hiRes.onload = () => {
      if (state.selectedPhotoId === photo.id) {
        dom.inspectorImg.src = photo.fullUrl;
      }
    };
    hiRes.src = photo.fullUrl;

    // Album Badge
    if (dom.inspectorAlbumBadge) {
      dom.inspectorAlbumBadge.textContent = photo.albumShortTitle || 'Archive';
      dom.inspectorAlbumBadge.classList.toggle('santa-cruz', photo.album === 'santa-cruz');
      dom.inspectorAlbumBadge.classList.toggle('scpl-postcards', photo.album === 'scpl-postcards');
      dom.inspectorAlbumBadge.classList.toggle('scpl-snapshots', photo.album === 'scpl-snapshots');
    }

    // Year & Catalog Badges
    dom.inspectorYearBadge.textContent = photo.yearLabel;
    if (photo.catalogId) {
      dom.inspectorCatalogBadge.textContent = `#${photo.catalogId}`;
      dom.inspectorCatalogBadge.style.display = 'inline-flex';
    } else {
      dom.inspectorCatalogBadge.style.display = 'none';
    }

    dom.inspectorTitle.textContent = photo.title;

    if (photo.notes) {
      dom.inspectorNotes.textContent = photo.notes;
      dom.inspectorNotes.style.display = 'block';
    } else {
      dom.inspectorNotes.style.display = 'none';
    }

    // Render JSON Info Blob section if present
    renderJsonInfoPanel(photo);

    dom.inspectorCoords.textContent = `${photo.lat.toFixed(6)}, ${photo.lng.toFixed(6)}`;
    if (dom.inspectorLocationName) {
      dom.inspectorLocationName.textContent =
        (photo.info && photo.info.coverage) || photo.locationName || 'California';
    }
    dom.inspectorFilename.textContent = photo.filename || 'Archival Scan';
    dom.inspectorDimensions.textContent =
      photo.info && photo.info.dimensions && photo.info.dimensions.display
        ? `${photo.info.dimensions.display} px`
        : photo.width && photo.height
          ? `${photo.width} × ${photo.height} px`
          : 'Original Scan';

    // All photos at this exact coordinate
    const colocated = allPhotos.filter((p) => p.lat === photo.lat && p.lng === photo.lng);
    dom.inspectorColocatedCount.textContent =
      colocated.length === 1
        ? '1 photo at this spot'
        : `${colocated.length} photos at this spot`;

    // External Action Links
    dom.inspectorStreetViewLink.href = photo.streetViewUrl;
    dom.inspectorGmapsLink.href = photo.googleMapsUrl;
    dom.inspectorGphotosLink.href = photo.albumPhotoUrl || photo.albumShortUrl;
    dom.inspectorDownloadLink.href =
      (photo.info && photo.info.original_image_url) || photo.downloadUrl || photo.fullUrl;

    // Render Co-Located Filmstrip if multiple photos share this coordinate
    renderModalFilmstrip(photo, colocated);

    // Show Modal
    dom.modalBackdrop.classList.add('open');

    // Update active state on sidebar & pins
    updateSelectedVisualState(photo);
  }

  function renderModalFilmstrip(activePhoto, colocatedList) {
    dom.filmstripTrack.innerHTML = '';

    const listToShow = colocatedList.length > 1 ? colocatedList : state.activeContextList.slice(0, 40);
    dom.filmstripLabel.textContent =
      colocatedList.length > 1
        ? `At this exact location (${colocatedList.length}):`
        : `Nearby in list (${listToShow.length}):`;

    listToShow.forEach((p) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `filmstrip-item ${p.id === activePhoto.id ? 'active' : ''}`;
      item.title = `${p.title} (${p.yearLabel})`;
      item.innerHTML = `
        <img src="${p.thumbUrl}" alt="${escapeHtml(p.title)}" loading="lazy" />
        <span class="filmstrip-year">${escapeHtml(String(p.year || p.yearLabel).slice(0, 6))}</span>
      `;
      item.addEventListener('click', () => {
        openPhotoModal(p, listToShow);
      });
      dom.filmstripTrack.appendChild(item);
    });

    requestAnimationFrame(() => {
      const activeThumb = dom.filmstripTrack.querySelector('.filmstrip-item.active');
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    });
  }

  function closePhotoModal() {
    dom.modalBackdrop.classList.remove('open');
    dom.inspectorImg.classList.remove('zoomed');
  }

  function stepModalPhoto(delta) {
    if (!state.activeContextList.length || !state.selectedPhotoId) return;
    const idx = state.activeContextList.findIndex((p) => p.id === state.selectedPhotoId);
    const nextIdx = (idx + delta + state.activeContextList.length) % state.activeContextList.length;
    const nextPhoto = state.activeContextList[nextIdx];
    if (nextPhoto) {
      openPhotoModal(nextPhoto, state.activeContextList);
      const targetLat =
        state.pinMode === 'all' ? nextPhoto.displayLat || nextPhoto.lat : nextPhoto.lat;
      const targetLng =
        state.pinMode === 'all' ? nextPhoto.displayLng || nextPhoto.lng : nextPhoto.lng;
      map.panTo([targetLat, targetLng], { animate: true });
    }
  }

  function updateSelectedVisualState(photo) {
    dom.photoFeed.querySelectorAll('.photo-card').forEach((card) => {
      const isMatch = card.dataset.photoId === photo.id;
      card.classList.toggle('selected', isMatch);
      if (isMatch) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    document.querySelectorAll('.gmap-pin').forEach((pinEl) => {
      pinEl.classList.toggle('selected', pinEl.dataset.photoId === photo.id);
    });

    drawLeaderLine(photo);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Event Listeners
  function bindEvents() {
    // Album Filter Segmented Control
    if (dom.albumFilterControl) {
      dom.albumFilterControl.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg-btn');
        if (!btn || !btn.dataset.album) return;
        const albumSlug = btn.dataset.album;
        if (state.selectedAlbum === albumSlug) return;

        state.selectedAlbum = albumSlug;
        dom.albumFilterControl.querySelectorAll('.seg-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });

        applyFilters();

        if (albumSlug === 'menlo-park') {
          map.flyTo([37.4529, -122.1842], 15, { duration: 0.85 });
        } else if (
          albumSlug === 'santa-cruz' ||
          albumSlug === 'scpl-postcards' ||
          albumSlug === 'scpl-snapshots'
        ) {
          map.flyTo([37.015, -122.055], 11, { duration: 0.85 });
        } else {
          map.flyTo([37.21, -122.11], 10, { duration: 0.85 });
        }
      });
    }

    // Pin Mode Switcher
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
    if (dom.jumpMenloPark) {
      dom.jumpMenloPark.addEventListener('click', () => {
        map.flyTo([37.4529, -122.1842], 15, { duration: 0.8 });
      });
    }

    if (dom.jumpSantaCruz) {
      dom.jumpSantaCruz.addEventListener('click', () => {
        map.flyTo([36.9741, -122.0308], 14, { duration: 0.8 });
      });
    }

    if (dom.jumpBoulderCreek) {
      dom.jumpBoulderCreek.addEventListener('click', () => {
        map.flyTo([37.1261, -122.1222], 14, { duration: 0.8 });
      });
    }

    if (dom.jumpIreland) {
      dom.jumpIreland.addEventListener('click', () => {
        map.flyTo([53.3043, -9.0729194], 16, { duration: 0.9 });
      });
    }

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
    const mpCount = allPhotos.filter((p) => p.album === 'menlo-park').length;
    const scCount = allPhotos.filter((p) => p.album === 'santa-cruz').length;
    const pcCount = allPhotos.filter((p) => p.album === 'scpl-postcards').length;
    const ssCount = allPhotos.filter((p) => p.album === 'scpl-snapshots').length;

    if (dom.headerSummaryText && allPhotos.length > 0) {
      dom.headerSummaryText.textContent = `${allPhotos.length.toLocaleString()} Geolocated Items · Menlo Park & Santa Cruz`;
    }
    if (dom.albumAllCount) dom.albumAllCount.textContent = allPhotos.length;
    if (dom.albumMpCount) dom.albumMpCount.textContent = mpCount;
    if (dom.albumScCount) dom.albumScCount.textContent = scCount;
    if (dom.albumPcCount) dom.albumPcCount.textContent = pcCount;
    if (dom.albumSsCount) dom.albumSsCount.textContent = ssCount;

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
