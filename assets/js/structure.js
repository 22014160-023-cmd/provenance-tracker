// structure.js — lazy WebGL with working Play transition (v40)
(function () {
  var pdbIdCache = {};
  var activeViewer = null;
  var currentModel = null;      // { data, format, kind, pdbId, acc }
  var currentMeta = null;

  // ---------- 1) PDB IDs from FULL UniProt record ----------
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

  // ---------- 2) BCIF download ----------
  function fetchBCIF(pdbId) {
    return fetch("https://models.rcsb.org/" + pdbId.toLowerCase() + ".bcif")
      .then(function (r) {
        if (!r.ok) throw new Error("bcif " + r.status);
        return r.arrayBuffer();
      });
  }

  // ---------- 3) AlphaFold fallback ----------
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

  // ---------- RCSB thumbnail URL ----------
  function pdbThumbnail(pdbId) {
    return "https://cdn.rcsb.org/images/structures/" +
           pdbId.toLowerCase() + "_assembly-1.jpeg";
  }

  // ---------- SVG preview for AlphaFold (no image on their server) ----------
  function alphaFoldSvg() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
        '<defs>' +
          '<linearGradient id="ag" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="#a78bfa"/>' +
            '<stop offset="50%" stop-color="#f472b6"/>' +
            '<stop offset="100%" stop-color="#60a5fa"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<rect width="400" height="400" fill="rgba(20,15,45,0.3)"/>' +
        '<path d="M 120 80 Q 280 160 120 240 Q -40 320 120 380" ' +
          'stroke="url(#ag)" stroke-width="18" fill="none" ' +
          'stroke-linecap="round"/>' +
        '<path d="M 280 80 Q 120 160 280 240 Q 440 320 280 380" ' +
          'stroke="url(#ag)" stroke-width="18" fill="none" ' +
          'stroke-linecap="round"/>' +
        '<text x="200" y="60" text-anchor="middle" ' +
          'fill="#fff" font-size="18" font-family="sans-serif" ' +
          'font-weight="600">AlphaFold prediction</text>' +
      '</svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // ---------- Render PNG/SVG preview ----------
  function renderPreview(container, imageUrl, metaHtml, onPlay) {
    container.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'mol-preview';
    container.appendChild(wrap);

    var img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Structure preview';
    img.style.opacity = '0';
    img.style.transition = 'opacity 0.4s ease';
    img.onload = function () { img.style.opacity = '1'; };
    img.onerror = function () {
      img.style.display = 'none';
      wrap.innerHTML = '<div class="mol-empty">' +
        'Preview not available — tap Play to render live</div>';
    };
    wrap.appendChild(img);

    // Big Play overlay
    var overlay = document.createElement('button');
    overlay.className = 'mol-play-overlay';
    overlay.type = 'button';
    overlay.innerHTML =
      '<svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">' +
        '<path d="M8 5v14l11-7z"/>' +
      '</svg>' +
      '<span class="mol-play-label">Play 3D</span>';
    overlay.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      onPlay();
    });
    overlay.addEventListener('touchstart', function () {
      overlay.classList.add('pressed');
    }, { passive: true });
    overlay.addEventListener('touchend', function () {
      overlay.classList.remove('pressed');
    });
    wrap.appendChild(overlay);

    if (metaHtml) {
      var meta = document.createElement('div');
      meta.className = 'mol-meta';
      meta.innerHTML = metaHtml;
      container.appendChild(meta);
    }
  }

  // ---------- Mount live WebGL ----------
  function mountLive3D(container, metaHtml) {
    if (!currentModel) {
      console.error("[Structure] mountLive3D called with no model");
      return;
    }

    // Clean up any existing viewer
    if (activeViewer && activeViewer.clear) {
      try { activeViewer.clear(); } catch (e) {}
      activeViewer = null;
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

    if (!window.$3Dmol) {
      container.innerHTML =
        '<div class="mol-empty">3Dmol.js failed to load</div>';
      return;
    }

    // Small delay so the container is laid out before WebGL init
    setTimeout(function () {
      try {
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

        setTimeout(function () {
          try { viewer.resize(); viewer.render(); } catch (e) {}
        }, 150);

        if (metaHtml) {
          var meta = document.createElement('div');
          meta.className = 'mol-meta';
          meta.innerHTML = metaHtml;
          container.appendChild(meta);
        }

        // Add a small "pause" button for live view
        var pauseBtn = document.createElement('button');
        pauseBtn.className = 'mol-live-pause';
        pauseBtn.type = 'button';
        pauseBtn.innerHTML = '⏸ Pause';
        pauseBtn.addEventListener('click', function () {
          try {
            if (viewer.__paused) {
              viewer.spin('y', 0.35);
              viewer.render();
              viewer.__paused = false;
              pauseBtn.innerHTML = '⏸ Pause';
            } else {
              viewer.spin('y', 0);
              viewer.render();
              viewer.__paused = true;
              pauseBtn.innerHTML = '▶ Resume';
            }
          } catch (e) {}
          if (navigator.vibrate) navigator.vibrate(6);
        });
        container.appendChild(pauseBtn);

      } catch (e) {
        console.error("[Structure] WebGL mount failed:", e);
        container.innerHTML =
          '<div class="mol-empty">Live 3D failed: ' + e.message + '</div>';
      }
    }, 60);
  }

  // ---------- Try one protein end-to-end ----------
  function tryOne(acc, container) {
    return getPDBIds(acc).then(function (pdbIds) {
      if (!pdbIds || !pdbIds.length) throw new Error("no PDB crossrefs");
      var pdbId = pdbIds[0];
      console.log("[Structure] PDB " + pdbId + " for " + acc);
      return fetchBCIF(pdbId).then(function (buf) {
        currentModel = { data: buf, format: 'bcif', pdbId: pdbId, acc: acc };
        var meta =
          '🧬 <strong>Experimental structure</strong> · ' +
          'PDB <a href="https://www.rcsb.org/structure/' + pdbId +
          '" target="_blank" rel="noopener">' + pdbId + '</a>' +
          (pdbIds.length > 1
            ? ' · +' + (pdbIds.length - 1) + ' more' : '') +
          ' · from ' + acc;

        renderPreview(container, pdbThumbnail(pdbId), meta, function () {
          mountLive3D(container, meta);
        });
        return true;
      });
    }).catch(function (e) {
      console.log("[Structure] PDB failed:", e.message, "→ AlphaFold");
      return fetchAlphaFold(acc).then(function (pdbText) {
        currentModel = { data: pdbText, format: 'pdb', kind: 'af', acc: acc };
        var meta =
          '🧬 <strong>Predicted structure</strong> · ' +
          '<a href="https://alphafold.ebi.ac.uk/entry/' + acc +
          '" target="_blank" rel="noopener">AlphaFold DB</a> · ' + acc;

        renderPreview(container, alphaFoldSvg(), meta, function () {
          mountLive3D(container, meta);
        });
        return true;
      }).catch(function (e2) {
        console.log("[Structure] AlphaFold failed:", e2.message);
        return false;
      });
    });
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

  // ---------- Main entry ----------
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

  function renderPlaceholder(container) {
    container.innerHTML =
      '<div class="mol-empty" style="padding:60px 20px;">' +
      'No experimental or predicted structure found for this search' +
      '</div>';
  }

  // ---------- Public API ----------
  function stopActive() {
    if (activeViewer && activeViewer.stopAnimate) {
      try { activeViewer.stopAnimate(); } catch (e) {}
    }
    activeViewer = null;
  }

  window.Structure = {
    stopActive: stopActive,
    renderFromSearch: renderFromSearch,
    tryOne: tryOne,
    render: function (acc, container) { tryOne(acc, container); }
  };
  console.log('[Structure] ready v40');
})();
