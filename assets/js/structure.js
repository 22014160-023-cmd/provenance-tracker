// structure.js v44 — click-proof preview + live 3D (built 2026-10-11)
(function () {
  var VERSION = "v44";
  var pdbIdCache = {};
  var activeViewer = null;
  var currentModel = null;
  var liveMode = false;

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

  function fetchBCIF(pdbId) {
    return fetch("https://models.rcsb.org/" + pdbId.toLowerCase() + ".bcif")
      .then(function (r) {
        if (!r.ok) throw new Error("bcif " + r.status);
        return r.arrayBuffer();
      });
  }

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

  function pdbThumbnail(pdbId) {
    return "https://cdn.rcsb.org/images/structures/" +
           pdbId.toLowerCase() + "_assembly-1.jpeg";
  }

  function alphaFoldSvg() {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
        '<defs><linearGradient id="ag" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0%" stop-color="#a78bfa"/>' +
          '<stop offset="50%" stop-color="#f472b6"/>' +
          '<stop offset="100%" stop-color="#60a5fa"/>' +
        '</linearGradient></defs>' +
        '<path d="M 120 80 Q 280 160 120 240 Q -40 320 120 380" ' +
          'stroke="url(#ag)" stroke-width="20" fill="none" ' +
          'stroke-linecap="round"/>' +
        '<path d="M 280 80 Q 120 160 280 240 Q 440 320 280 380" ' +
          'stroke="url(#ag)" stroke-width="20" fill="none" ' +
          'stroke-linecap="round"/>' +
      '</svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function resetLive() { liveMode = false; }

  function renderPreview(container, imageUrl, metaHtml, onPlay) {
    container.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'mol-preview';
    wrap.style.cssText =
      'position:relative;width:100%;height:100%;' +
      'display:flex;align-items:center;justify-content:center;' +
      'overflow:hidden;min-height:280px;';

    var img = document.createElement('img');
    img.src = imageUrl;
    img.alt = '';
    img.style.cssText =
      'max-width:70%;max-height:70%;object-fit:contain;' +
      'pointer-events:none;user-select:none;' +
      'filter:drop-shadow(0 10px 30px rgba(0,0,0,0.5));' +
      'border-radius:10px;';
    img.onerror = function () { img.src = alphaFoldSvg(); };
    wrap.appendChild(img);

    var overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'mol-play-overlay';
    overlay.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26" ' +
        'fill="currentColor" style="flex-shrink:0">' +
        '<path d="M8 5v14l11-7z"/>' +
      '</svg><span>Play 3D</span>';
    overlay.style.cssText =
      'position:absolute;bottom:22px;left:50%;' +
      'transform:translateX(-50%);' +
      'z-index:100;pointer-events:auto;cursor:pointer;' +
      'display:inline-flex;align-items:center;gap:8px;' +
      'padding:13px 22px;border-radius:999px;' +
      'background:rgba(34,197,94,0.95);' +
      'border:2px solid rgba(255,255,255,0.6);' +
      'color:#fff;font-size:14.5px;font-weight:700;' +
      'font-family:inherit;' +
      'box-shadow:0 12px 32px rgba(34,197,94,0.55);' +
      'transition:transform 0.15s ease,background 0.15s ease;' +
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent;';

    var fired = false;
    function fire(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (fired) return;
      fired = true;
      overlay.disabled = true;
      overlay.innerHTML = '<span>Loading…</span>';
      try { onPlay(); } catch (err) {
        console.error("[Structure] onPlay error:", err);
        overlay.disabled = false;
        overlay.innerHTML = '<span>Play 3D</span>';
        fired = false;
      }
    }
    overlay.addEventListener('click', fire);
    overlay.addEventListener('touchend', fire);

    wrap.appendChild(overlay);
    container.appendChild(wrap);

    if (metaHtml) {
      var meta = document.createElement('div');
      meta.className = 'mol-meta';
      meta.innerHTML = metaHtml;
      container.appendChild(meta);
    }
  }

  function mountLive3D(container, metaHtml) {
    if (!currentModel) return;

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
      container.innerHTML = '<div class="mol-empty">3Dmol.js not loaded</div>';
      return;
    }

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
            color: 'spectrum', arrows: true, tubes: true, thickness: 0.5
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

        var pauseBtn = document.createElement('button');
        pauseBtn.type = 'button';
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.style.cssText =
          'position:absolute;bottom:12px;left:14px;z-index:100;' +
          'padding:7px 14px;border-radius:999px;' +
          'background:rgba(255,255,255,0.14);' +
          'border:1px solid rgba(255,255,255,0.35);' +
          'color:#fff;cursor:pointer;font-size:11px;' +
          'font-weight:600;font-family:inherit;' +
          'touch-action:manipulation;';
        pauseBtn.addEventListener('click', function () {
          try {
            if (viewer.__paused) {
              viewer.spin('y', 0.35);
              viewer.render();
              viewer.__paused = false;
              pauseBtn.textContent = '⏸ Pause';
            } else {
              viewer.spin('y', 0);
              viewer.render();
              viewer.__paused = true;
              pauseBtn.textContent = '▶ Resume';
            }
          } catch (e) {}
        });
        container.style.position = 'relative';
        container.appendChild(pauseBtn);
      } catch (e) {
        console.error("[Structure] WebGL mount failed:", e);
        container.innerHTML =
          '<div class="mol-empty">Live 3D failed: ' + e.message + '</div>';
      }
    }, 60);
  }

  function tryOne(acc, container) {
    return getPDBIds(acc).then(function (pdbIds) {
      if (!pdbIds || !pdbIds.length) throw new Error("no PDB");
      var pdbId = pdbIds[0];
      console.log("[Structure] PDB " + pdbId + " for " + acc);
      return fetchBCIF(pdbId).then(function (buf) {
        currentModel = { data: buf, format: 'bcif', pdbId: pdbId, acc: acc };
        var meta =
          '🧬 <strong>Experimental structure</strong> · ' +
          'PDB <a href="https://www.rcsb.org/structure/' + pdbId +
          '" target="_blank" rel="noopener">' + pdbId + '</a>' +
          (pdbIds.length > 1 ? ' · +' + (pdbIds.length - 1) + ' more' : '') +
          ' · from ' + acc;
        resetLive();
        renderPreview(container, pdbThumbnail(pdbId), meta, function () {
          mountLive3D(container, meta);
        });
        return true;
      });
    }).catch(function (e) {
      console.log("[Structure] PDB failed: " + e.message + " → AlphaFold");
      return fetchAlphaFold(acc).then(function (pdbText) {
        currentModel = { data: pdbText, format: 'pdb', kind: 'af', acc: acc };
        var meta =
          '🧬 <strong>Predicted structure</strong> · ' +
          '<a href="https://alphafold.ebi.ac.uk/entry/' + acc +
          '" target="_blank" rel="noopener">AlphaFold DB</a> · ' + acc;
        resetLive();
        renderPreview(container, alphaFoldSvg(), meta, function () {
          mountLive3D(container, meta);
        });
        return true;
      }).catch(function (e2) {
        console.log("[Structure] AlphaFold failed: " + e2.message);
        return false;
      });
    });
  }

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

  function renderFromSearch(proteins, container) {
    container.innerHTML =
      '<div class="mol-loading">Finding a representative structure…' +
      '<div class="loading-bar"></div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.55);' +
      'margin-top:8px">Static preview loads first · tap Play to spin</div></div>';

    var ranked = rankCandidates(proteins).slice(0, 5);
    var idx = 0;

    function tryNext() {
      if (idx >= ranked.length) {
        container.innerHTML =
          '<div class="mol-empty" style="padding:60px 20px;">' +
          'No structure found for this search</div>';
        return;
      }
      var acc = ranked[idx].primaryAccession;
      idx++;
      tryOne(acc, container).then(function (ok) {
        if (!ok) tryNext();
      }).catch(tryNext);
    }
    tryNext();
  }

  function stopActive() {
    if (activeViewer && activeViewer.stopAnimate) {
      try { activeViewer.stopAnimate(); } catch (e) {}
    }
    activeViewer = null;
  }

  function startLive() {
    var container = document.getElementById('collective-3d');
    if (!container) return Promise.reject(new Error('no container'));
    var metaEl = container.querySelector('.mol-meta');
    var metaHtml = metaEl ? metaEl.innerHTML : '';
    return new Promise(function (resolve, reject) {
      try {
        mountLive3D(container, metaHtml);
        // Wait a bit for the viewer to attach
        setTimeout(function () {
          if (activeViewer) {
            liveMode = true;
            resolve(true);
          } else {
            reject(new Error('WebGL did not initialize'));
          }
        }, 400);
      } catch (e) { reject(e); }
    });
  }

  function isLive() { return liveMode; }

  function toggleSpin() {
    if (!activeViewer) return false;
    try {
      if (activeViewer.__paused) {
        activeViewer.spin('y', 0.35);
        activeViewer.render();
        activeViewer.__paused = false;
        return true;
      } else {
        activeViewer.spin('y', 0);
        activeViewer.render();
        activeViewer.__paused = true;
        return false;
      }
    } catch (e) { return false; }
  }

  window.Structure = {
    startLive: startLive,
    isLive: isLive,
    toggleSpin: toggleSpin,
    stopActive: stopActive,
    renderFromSearch: renderFromSearch,
    tryOne: tryOne,
    render: function (acc, container) { tryOne(acc, container); }
  };
  console.log('[Structure] ready ' + VERSION);
})();
