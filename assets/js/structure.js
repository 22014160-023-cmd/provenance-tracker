// structure.js — lazy WebGL: PNG preview first, live 3D on demand
(function () {
  var pdbIdCache = {};
  var activeViewer = null;
  var currentModel = null;       // { data, format, source }
  var currentContainer = null;
  var liveRendered = false;

  // ---------- STEP 1: PDB IDs from UniProt crossrefs ----------
  function getPDBIds(acc) {
    if (pdbIdCache[acc]) return Promise.resolve(pdbIdCache[acc]);
    return fetch("https://rest.uniprot.org/uniprotkb/" +
                 encodeURIComponent(acc) + ".json",
                 { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("UniProt " + r.status);
        return r.json();
      })
      .then(function (data) {
        var ids = (data.uniProtKBCrossReferences || [])
          .filter(function (x) { return x.database === "PDB"; })
          .map(function (x) { return x.id; });
        pdbIdCache[acc] = ids;
        return ids;
      });
  }

  // ---------- STEP 2: BCIF from models.rcsb.org ----------
  function fetchBCIF(pdbId) {
    return fetch("https://models.rcsb.org/" + pdbId.toLowerCase() + ".bcif")
      .then(function (r) {
        if (!r.ok) throw new Error("bcif " + r.status);
        return r.arrayBuffer();
      });
  }

  // ---------- STEP 3: AlphaFold API ----------
  function fetchAlphaFold(acc) {
    return fetch("https://alphafold.ebi.ac.uk/api/prediction/" +
                 encodeURIComponent(acc))
      .then(function (r) {
        if (!r.ok) throw new Error("AF api " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) throw new Error("no AF");
        var pdbUrl = data[0].pdbUrl;
        if (!pdbUrl) throw new Error("no pdbUrl");
        return fetch(pdbUrl).then(function (r) {
          if (!r.ok) throw new Error("AF file " + r.status);
          return r.text();
        });
      });
  }

  // ---------- RCSB PNG thumbnail URL ----------
  // RCSB serves curated preview images for every PDB entry.
  // These are pre-rendered — no WebGL, no GPU cost, instant.
  function pdbThumbnailUrl(pdbId) {
    var id = pdbId.toUpperCase();
    // RCSB's assembly image (large, cached at their CDN)
    return "https://cdn.rcsb.org/images/structures/" +
           id.toLowerCase() + "_assembly-1.jpeg";
  }

  // ---------- Render: PNG preview (no WebGL) ----------
  function renderPreview(imgUrl, container, metaHtml, onPlay) {
    container.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'mol-preview';
    wrap.style.cssText =
      'width:100%;height:100%;display:flex;align-items:center;' +
      'justify-content:center;position:relative;overflow:hidden;';

    var img = document.createElement('img');
    img.src = imgUrl;
    img.alt = 'Structure preview';
    img.style.cssText =
      'max-width:90%;max-height:90%;object-fit:contain;' +
      'filter:drop-shadow(0 8px 24px rgba(0,0,0,0.45));' +
      'transition:transform 0.3s ease;';
    img.addEventListener('mouseenter', function () {
      img.style.transform = 'scale(1.03)';
    });
    img.addEventListener('mouseleave', function () {
      img.style.transform = 'scale(1)';
    });
    img.onerror = function () {
      // Fallback if RCSB image missing — show simple SVG
      wrap.innerHTML = '<div class="mol-empty">' +
        'Static preview unavailable — tap Play to load live 3D</div>';
    };

    wrap.appendChild(img);

    // Play overlay button (big, central)
    var overlay = document.createElement('button');
    overlay.className = 'mol-play-overlay';
    overlay.innerHTML =
      '<svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">' +
        '<path d="M8 5v14l11-7z"/>' +
      '</svg>';
    overlay.style.cssText =
      'position:absolute;bottom:14px;left:50%;' +
      'transform:translateX(-50%);' +
      'width:64px;height:64px;border-radius:50%;' +
      'background:rgba(34,197,94,0.85);' +
      'border:2px solid rgba(255,255,255,0.55);' +
      'color:#fff;cursor:pointer;' +
      'box-shadow:0 8px 28px rgba(34,197,94,0.55);' +
      'display:flex;align-items:center;justify-content:center;' +
      'transition:all 0.18s ease;z-index:6;' +
      'touch-action:manipulation;';
    overlay.addEventListener('click', onPlay);
    overlay.addEventListener('touchstart', function () {
      overlay.style.transform = 'translateX(-50%) scale(0.94)';
    }, { passive: true });
    overlay.addEventListener('touchend', function () {
      overlay.style.transform = 'translateX(-50%) scale(1)';
    });
    wrap.appendChild(overlay);

    container.appendChild(wrap);

    // meta
    if (metaHtml) {
      var meta = document.createElement('div');
      meta.className = 'mol-meta';
      meta.innerHTML = metaHtml;
      container.appendChild(meta);
    }
  }

  // ---------- Render: live WebGL 3D ----------
  function mountLive3D(container, metaHtml) {
    if (!currentModel) return;
    if (!window.$3Dmol) {
      container.innerHTML =
        '<div class="mol-empty">3Dmol.js failed to load</div>';
      return;
    }

    container.innerHTML = '';

    var height = 380;
    if (window.innerWidth < 600) height = 320;
    if (window.innerWidth < 400) height = 280;

    var canvas = document.createElement('div');
    canvas.className = 'mol-canvas';
    canvas.style.cssText =
      'width:100%;height:' + height + 'px;min-height:' + height + 'px;' +
      'display:block;position:relative;';
    container.appendChild(canvas);

    setTimeout(function () {
      try {
        if (activeViewer && activeViewer.clear) {
          try { activeViewer.clear(); } catch (e) {}
        }
        var viewer = window.$3Dmol.createViewer(canvas, {
          backgroundColor: 'rgba(20,15,45,0.55)',
          antialias: false
        });
        activeViewer = viewer;
        viewer.addModel(currentModel.data, currentModel.format);
        viewer.setStyle({}, {
          cartoon: {
            color: 'spectrum',
            arrows: true,
            tubes: true,
            thickness: 0.5
          }
        });
        try {
          viewer.setStyle({ hetflag: true }, {
            stick: { radius: 0.15, colorscheme: 'greenCarbon' },
            sphere: { radius: 0.25 }
          });
        } catch (e) {}
        viewer.zoomTo();
        viewer.zoom(1.05);
        viewer.spin('y', 0.35);
        viewer.render();
        liveRendered = true;

        setTimeout(function () {
          try { viewer.resize(); viewer.render(); } catch (e) {}
        }, 200);

        if (metaHtml) {
          var meta = document.createElement('div');
          meta.className = 'mol-meta';
          meta.innerHTML = metaHtml;
          container.appendChild(meta);
        }
      } catch (e) {
        console.error("[Structure] live mount failed:", e);
        container.innerHTML =
          '<div class="mol-empty">Render error: ' + e.message + '</div>';
      }
    }, 40);
  }

  // ---------- Stop / pause / resume ----------
  function stopActive() {
    if (activeViewer && activeViewer.stopAnimate) {
      try { activeViewer.stopAnimate(); } catch (e) {}
    }
    activeViewer = null;
    liveRendered = false;
  }

  function pauseSpin() {
    if (!activeViewer) return false;
    try { activeViewer.spin('y', 0); activeViewer.render(); } catch (e) {}
    return false;
  }

  function resumeSpin() {
    if (!activeViewer) return false;
    try {
      activeViewer.spin('y', 0.35);
      activeViewer.render();
    } catch (e) {}
    return true;
  }

  function toggleSpin() {
    if (!liveRendered) return true;   // not yet live → treat as start
    if (!activeViewer) return false;
    // Check if spinning by seeing if viewer has an active spin
    // Simplest approach: track a flag
    if (activeViewer.__paused) {
      activeViewer.__paused = false;
      return resumeSpin();
    }
    activeViewer.__paused = true;
    return pauseSpin();
  }

  function isLive() { return liveRendered; }

  // ---------- tryOne: choose PDB or AlphaFold ----------
  function tryOne(acc, container, onReady) {
    return getPDBIds(acc).then(function (pdbIds) {
      if (!pdbIds || !pdbIds.length) throw new Error("no PDB crossrefs");
      var pdbId = pdbIds[0];
      return fetchBCIF(pdbId).then(function (buf) {
        currentModel = { data: buf, format: 'bcif', pdbId: pdbId, acc: acc };
        currentContainer = container;
        var meta =
          '🧬 <strong>Experimental structure</strong> · ' +
          'PDB <a href="https://www.rcsb.org/structure/' + pdbId +
          '" target="_blank">' + pdbId + '</a>' +
          (pdbIds.length > 1 ? ' · +' + (pdbIds.length - 1) + ' more' : '') +
          ' · from ' + acc;

        // Show static preview by default
        var previewUrl = pdbThumbnailUrl(pdbId);
        renderPreview(previewUrl, container, meta, function () {
          // user tapped Play → mount live WebGL
          if (onReady) onReady();
          mountLive3D(container, meta);
          // mark viewer as not paused (spinning)
          if (activeViewer) activeViewer.__paused = false;
          if (window.PlayState) window.PlayState.set(true);
        });

        // Reset play state — waiting for user
        if (window.PlayState) window.PlayState.set(false);
        return true;
      });
    }).catch(function (e) {
      console.log("[Structure] PDB failed:", e.message, "→ AlphaFold");
      return fetchAlphaFold(acc).then(function (pdbText) {
        currentModel = { data: pdbText, format: 'pdb', acc: acc };
        currentContainer = container;
        var meta =
          '🧬 <strong>Predicted structure</strong> · ' +
          '<a href="https://alphafold.ebi.ac.uk/entry/' + acc +
          '" target="_blank">AlphaFold DB</a> · ' + acc;

        // AlphaFold has no PNG preview — use a colored SVG placeholder
        renderPreview(alphaFoldPreviewSvg(), container, meta, function () {
          if (onReady) onReady();
          mountLive3D(container, meta);
          if (activeViewer) activeViewer.__paused = false;
          if (window.PlayState) window.PlayState.set(true);
        });

        if (window.PlayState) window.PlayState.set(false);
        return true;
      }).catch(function (e2) {
        console.log("[Structure] AlphaFold failed:", e2.message);
        return false;
      });
    });
  }

  // Inline SVG data URL for AlphaFold preview
  function alphaFoldPreviewSvg() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0%" stop-color="#a78bfa"/>' +
          '<stop offset="50%" stop-color="#f472b6"/>' +
          '<stop offset="100%" stop-color="#60a5fa"/>' +
        '</linearGradient></defs>' +
        '<path d="M 90 40 Q 210 90 90 150 Q -30 210 90 260" ' +
          'stroke="url(#g)" stroke-width="14" fill="none" ' +
          'stroke-linecap="round"/>' +
        '<path d="M 210 40 Q 90 90 210 150 Q 330 210 210 260" ' +
          'stroke="url(#g)" stroke-width="14" fill="none" ' +
          'stroke-linecap="round"/>' +
        '<text x="150" y="290" text-anchor="middle" ' +
          'fill="#fff" font-size="12" font-family="sans-serif">' +
          'AlphaFold predicted structure</text>' +
      '</svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // ---------- Rank candidates ----------
  function rankCandidates(proteins) {
    var viable = proteins.filter(function (p) {
      var featCount = (p.features || []).length;
      var seqLen = (p.sequence && p.sequence.length) || 0;
      return featCount >= 3 || seqLen >= 100;
    });
    if (!viable.length) viable = proteins.slice();

    return viable.slice().sort(function (a, b) {
      var aR = a.entryType && a.entryType.indexOf("reviewed") >= 0 ? 1 : 0;
      var bR = b.entryType && b.entryType.indexOf("reviewed") >= 0 ? 1 : 0;
      var aLen = (a.sequence && a.sequence.length) || 0;
      var bLen = (b.sequence && b.sequence.length) || 0;
      var aF = (a.features || []).length;
      var bF = (b.features || []).length;
      var aS = aR * 500 + aF * 10 + Math.min(aLen, 2000);
      var bS = bR * 500 + bF * 10 + Math.min(bLen, 2000);
      return bS - aS;
    });
  }

  // ---------- Entry from search result set ----------
  function renderFromSearch(proteins, container) {
    container.innerHTML =
      '<div class="mol-loading">Finding a representative structure…' +
      '<div class="loading-bar"></div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:8px">' +
      'Static preview loads first · tap Play to spin</div></div>';

    var ranked = rankCandidates(proteins).slice(0, 5);
    var idx = 0;

    function tryNext() {
      if (idx >= ranked.length) { renderPlaceholder(container); return; }
      var acc = ranked[idx].primaryAccession;
      idx++;
      console.log("[Structure] Trying " + acc);
      tryOne(acc, container).then(function (ok) {
        if (!ok) tryNext();
      }).catch(tryNext);
    }
    tryNext();
  }

  // ---------- Placeholder ----------
  function renderPlaceholder(container) {
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.style.cssText =
      'width:100%;height:100%;display:flex;align-items:center;' +
      'justify-content:center;position:relative;min-height:280px;';
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    svg.style.cssText =
      'width:180px;height:180px;animation:spin3d 6s linear infinite;' +
      'transform-style:preserve-3d;';
    var defs = document.createElementNS(ns, 'defs');
    defs.innerHTML =
      '<linearGradient id="fbGrad" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#a78bfa"/>' +
        '<stop offset="50%" stop-color="#f472b6"/>' +
        '<stop offset="100%" stop-color="#60a5fa"/>' +
      '</linearGradient>';
    svg.appendChild(defs);
    [['M -50 -60 Q 50 -30 -50 0 Q 50 30 -50 60'],
     ['M 50 -60 Q -50 -30 50 0 Q -50 30 50 60']].forEach(function (arr) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', arr[0]);
      p.setAttribute('stroke', 'url(#fbGrad)');
      p.setAttribute('stroke-width', '5');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      svg.appendChild(p);
    });
    [-40, -20, 0, 20, 40].forEach(function (y) {
      var l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', '-40'); l.setAttribute('y1', y);
      l.setAttribute('x2', '40');  l.setAttribute('y2', y);
      l.setAttribute('stroke', 'url(#fbGrad)');
      l.setAttribute('stroke-width', '1.6');
      l.setAttribute('opacity', '0.55');
      svg.appendChild(l);
    });
    wrap.appendChild(svg);
    container.appendChild(wrap);
    if (!document.getElementById('spin3dKeyframe')) {
      var style = document.createElement('style');
      style.id = 'spin3dKeyframe';
      style.textContent =
        '@keyframes spin3d{' +
          '0%{transform:rotateY(0deg) rotateX(8deg)}' +
          '100%{transform:rotateY(360deg) rotateX(8deg)}' +
        '}';
      document.head.appendChild(style);
    }
  }

  window.Structure = {
    stopActive: stopActive,
    pauseSpin: pauseSpin,
    resumeSpin: resumeSpin,
    toggleSpin: toggleSpin,
    isLive: isLive,
    renderFromSearch: renderFromSearch,
    getPDBIds: getPDBIds,
    tryOne: tryOne,
    render: function (acc, container) { tryOne(acc, container); }
  };
  console.log('[Structure] ready v38 — lazy WebGL');
})();
