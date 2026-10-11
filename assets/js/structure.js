// structure.js v47 — preloads WebGL in the background
(function () {
  var VERSION = "v47";
  var pdbIdCache = {};
  var activeViewer = null;
  var currentModel = null;
  var prebuiltContainer = null;
  var prebuiltMeta = null;
  var isReady = false;

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
        return fetch(pdbUrl).then(function (r) { return r.text(); });
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

  // ---------- Preview (visible to user) ----------
  function renderPreview(container, imageUrl, metaHtml, onPlay) {
    container.innerHTML = '';
    prebuiltContainer = null;
    prebuiltMeta = null;
    isReady = false;

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

    // little "preparing" badge while we preload
    var badge = document.createElement('div');
    badge.className = 'mol-preload-badge';
    badge.style.cssText =
      'position:absolute;top:14px;left:50%;transform:translateX(-50%);' +
      'font-size:10.5px;letter-spacing:0.5px;' +
      'padding:5px 12px;border-radius:999px;' +
      'background:rgba(255,255,255,0.10);' +
      'border:1px solid rgba(255,255,255,0.28);' +
      'color:rgba(255,255,255,0.85);font-weight:600;' +
      'pointer-events:none;z-index:20;';
    badge.textContent = '⟳ preparing 3D…';
    wrap.appendChild(badge);

    wrap.appendChild(document.createElement('div')); // placeholder
    wrap.lastChild.remove();

    container.appendChild(wrap);

    if (metaHtml) {
      var meta = document.createElement('div');
      meta.className = 'mol-meta';
      meta.innerHTML = metaHtml;
      container.appendChild(meta);
    }

    // Preload the WebGL viewer into a hidden div NOW
    if (currentModel && window.$3Dmol) {
      prebuildHiddenViewer(metaHtml).then(function () {
        isReady = true;
        badge.style.opacity = '0';
        setTimeout(function () { badge.remove(); }, 400);
        console.log('[Structure] background preload ready');
      }).catch(function (e) {
        console.warn('[Structure] preload failed:', e);
        badge.textContent = '✓ ready';
        badge.style.opacity = '0.6';
      });
    } else {
      badge.remove();
    }
  }

  // ---------- Build WebGL viewer in an offscreen container ----------
  function prebuildHiddenViewer(metaHtml) {
    return new Promise(function (resolve, reject) {
      if (!window.$3Dmol || !currentModel) {
        return reject(new Error('no 3Dmol or model'));
      }

      // Offscreen hidden container
      var offscreen = document.createElement('div');
      offscreen.style.cssText =
        'position:fixed;left:-99999px;top:-99999px;' +
        'width:800px;height:600px;';
      document.body.appendChild(offscreen);

      try {
        var viewer = window.$3Dmol.createViewer(offscreen, {
          backgroundColor: 'rgba(20,15,45,0.55)',
          antialias: false
        });
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
        // Start PAUSED — no spin until user taps Play
        viewer.spin('y', 0);
        viewer.render();

        activeViewer = viewer;
        activeViewer.__paused = true;
        activeViewer.__offscreen = offscreen;
        prebuiltMeta = metaHtml;
        resolve(viewer);
      } catch (e) {
        try { offscreen.remove(); } catch (e2) {}
        reject(e);
      }
    });
  }

  // ---------- Live view (visible) — reuse the prebuilt viewer ----------
  function mountLive3D(container, metaHtml) {
    if (!currentModel) return;

    // If we already have a prebuilt viewer — just move its DOM to the visible container
    if (activeViewer && activeViewer.__offscreen) {
      container.innerHTML = '';
      container.style.position = 'relative';

      // Attach visible canvas frame
      var frame = document.createElement('div');
      frame.className = 'mol-canvas-live';
      frame.style.cssText =
        'width:100%;height:100%;min-height:340px;position:relative;';
      container.appendChild(frame);

      // Move the offscreen container (which holds the WebGL canvas) into frame
      frame.appendChild(activeViewer.__offscreen);
      activeViewer.__offscreen.style.cssText =
        'position:relative;left:0;top:0;width:100%;height:100%;';

      // Resize + start spinning
      setTimeout(function () {
        try {
          activeViewer.resize();
          activeViewer.spin('y', 0.35);
          activeViewer.render();
          activeViewer.__paused = false;
        } catch (e) {}
      }, 50);

      if (metaHtml) {
        var meta = document.createElement('div');
        meta.className = 'mol-meta';
        meta.innerHTML = metaHtml;
        container.appendChild(meta);
      }

      // Add pause button
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
          if (activeViewer.__paused) {
            activeViewer.spin('y', 0.35);
            activeViewer.render();
            activeViewer.__paused = false;
            pauseBtn.textContent = '⏸ Pause';
          } else {
            activeViewer.spin('y', 0);
            activeViewer.render();
            activeViewer.__paused = true;
            pauseBtn.textContent = '▶ Resume';
          }
        } catch (e) {}
      });
      container.appendChild(pauseBtn);

      return;
    }

    // Fallback: build fresh (should not happen if preload succeeded)
    container.innerHTML = '';
    container.style.position = 'relative';
    var canvas = document.createElement('div');
    canvas.className = 'mol-canvas';
    canvas.style.cssText =
      'width:100%;height:380px;min-height:380px;display:block;position:relative;';
    container.appendChild(canvas);

    if (!window.$3Dmol) return;
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
        viewer.zoomTo();
        viewer.spin('y', 0.35);
        viewer.render();
        if (metaHtml) {
          var meta = document.createElement('div');
          meta.className = 'mol-meta';
          meta.innerHTML = metaHtml;
          container.appendChild(meta);
        }
      } catch (e) {
        console.error('[Structure] fallback mount failed:', e);
      }
    }, 40);
  }

  // ---------- tryOne ----------
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
      return (bR * 500 + bF * 10 + Math.min(bLen, 2000)) -
             (aR * 500 + aF * 10 + Math.min(aLen, 2000));
    });
  }

  function renderFromSearch(proteins, container) {
    // Clean up any old offscreen viewer
    if (activeViewer && activeViewer.__offscreen) {
      try { activeViewer.__offscreen.remove(); } catch (e) {}
    }
    activeViewer = null;
    prebuiltContainer = null;
    prebuiltMeta = null;
    isReady = false;

    container.innerHTML =
      '<div class="mol-loading">Finding a representative structure…' +
      '<div class="loading-bar"></div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.55);' +
      'margin-top:8px">Preview loads instantly · 3D preloads in background' +
      '</div></div>';

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

  function startLive() {
    return new Promise(function (resolve, reject) {
      var container = document.getElementById('collective-3d');
      if (!container) return reject(new Error('no container'));

      // Fast path: prebuild already finished
      if (activeViewer && activeViewer.__offscreen) {
        var metaEl = container.querySelector('.mol-meta');
        var metaHtml = metaEl ? metaEl.innerHTML : prebuiltMeta;
        mountLive3D(container, metaHtml);
        return resolve(true);
      }

      // Slow path: still preloading — poll for 4 s
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (activeViewer && activeViewer.__offscreen) {
          clearInterval(iv);
          var metaEl = container.querySelector('.mol-meta');
          var metaHtml = metaEl ? metaEl.innerHTML : prebuiltMeta;
          mountLive3D(container, metaHtml);
          resolve(true);
        } else if (tries > 40) {
          clearInterval(iv);
          reject(new Error('preload timed out'));
        }
      }, 100);
    });
  }

  function isLive() {
    return !!(activeViewer && !activeViewer.__offscreen);
  }

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
  console.log('[Structure] ready ' + VERSION + ' — preloaded WebGL');
})();
