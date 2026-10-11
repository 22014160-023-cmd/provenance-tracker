// structure.js v48 — live WebGL first, PNG fallback only
(function () {
  var VERSION = "v48";
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

  // ---------- LIVE 3D — primary path ----------
  function renderLive(container, metaHtml) {
    container.innerHTML = '';
    container.style.position = 'relative';

    var height = 380;
    if (window.innerWidth < 600) height = 340;
    if (window.innerWidth < 400) height = 300;

    var canvas = document.createElement('div');
    canvas.className = 'mol-canvas';
    canvas.style.cssText =
      'width:100%;height:' + height + 'px;min-height:' + height + 'px;' +
      'display:block;position:relative;';
    container.appendChild(canvas);

    if (!window.$3Dmol) {
      // No WebGL — fall back to PNG
      renderPngFallback(container, metaHtml);
      return;
    }

    setTimeout(function () {
      try {
        // Tear down any existing viewer
        if (activeViewer && activeViewer.clear) {
          try { activeViewer.clear(); } catch (e) {}
        }

        var viewer = window.$3Dmol.createViewer(canvas, {
          backgroundColor: 'rgba(20,15,45,0.55)',
          antialias: false
        });
        activeViewer = viewer;
        liveMode = true;

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
        viewer.spin('y', 0.35);   // starts spinning immediately
        viewer.render();
        viewer.__paused = false;

        // Resize pass after layout settles
        setTimeout(function () {
          try { viewer.resize(); viewer.render(); } catch (e) {}
        }, 150);

        if (metaHtml) {
          var meta = document.createElement('div');
          meta.className = 'mol-meta';
          meta.innerHTML = metaHtml;
          container.appendChild(meta);
        }

        // Pause/Resume button (bottom-left)
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
          if (navigator.vibrate) navigator.vibrate(6);
        });
        container.appendChild(pauseBtn);

        console.log('[Structure] live 3D spinning');

      } catch (e) {
        console.error('[Structure] WebGL failed:', e);
        renderPngFallback(container, metaHtml);
      }
    }, 60);
  }

  // ---------- PNG fallback (only if WebGL fails) ----------
  function renderPngFallback(container, metaHtml) {
    liveMode = false;
    container.innerHTML = '';

    var imgSrc = pdbThumbnail(currentModel.pdbId || currentModel.acc);
    var wrap = document.createElement('div');
    wrap.style.cssText =
      'position:relative;width:100%;height:100%;' +
      'display:flex;align-items:center;justify-content:center;' +
      'overflow:hidden;min-height:280px;';

    var img = document.createElement('img');
    img.src = imgSrc;
    img.style.cssText =
      'max-width:70%;max-height:70%;object-fit:contain;' +
      'filter:drop-shadow(0 10px 30px rgba(0,0,0,0.5));' +
      'border-radius:10px;';
    img.onerror = function () { img.src = alphaFoldSvg(); };
    wrap.appendChild(img);
    container.appendChild(wrap);

    if (metaHtml) {
      var meta = document.createElement('div');
      meta.className = 'mol-meta';
      meta.innerHTML = metaHtml;
      container.appendChild(meta);
    }
  }

  // ---------- Fetch + render ----------
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
        renderLive(container, meta);
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
        renderLive(container, meta);
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
      return (bR * 500 + bF * 10 + Math.min(bLen, 2000)) -
             (aR * 500 + aF * 10 + Math.min(aLen, 2000));
    });
  }

  function renderFromSearch(proteins, container) {
    container.innerHTML =
      '<div class="mol-loading">Loading 3D structure…' +
      '<div class="loading-bar"></div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.55);' +
      'margin-top:8px">Trying up to 5 proteins</div></div>';

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

  function startLive() {
    // In v48 3D is already live — this is a no-op for compatibility
    return Promise.resolve(true);
  }

  function stopActive() {
    if (activeViewer && activeViewer.stopAnimate) {
      try { activeViewer.stopAnimate(); } catch (e) {}
    }
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
  console.log('[Structure] ready ' + VERSION + ' — always rotating');
})();
