// structure.js — CORS-safe 3D viewer (v34, clean)
(function () {
  var pdbIdCache = {};
  var activeViewer = null;
  var spinPaused = true;   // start paused — user opts in to rotation
  var lastKnownSpin = 0.35;

  // ---------- STEP 1: get PDB IDs from UniProt crossreferences ----------
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

  // ---------- STEP 2: fetch BinaryCIF from models.rcsb.org ----------
  function fetchBCIF(pdbId) {
    return fetch("https://models.rcsb.org/" + pdbId.toLowerCase() + ".bcif")
      .then(function (r) {
        if (!r.ok) throw new Error("bcif " + r.status);
        return r.arrayBuffer();
      });
  }

  // ---------- STEP 3: AlphaFold dynamic URL via API ----------
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

  // ---------- Stop current viewer ----------
  function pauseSpin() {
    if (!activeViewer) return;
    spinPaused = true;
    try {
      if (activeViewer.spin && typeof activeViewer.spin === 'function') {
        activeViewer.spin('y', 0);
      }
    } catch (e) {}
  }

  function resumeSpin() {
    if (!activeViewer) return;
    spinPaused = false;
    try {
      activeViewer.spin('y', lastKnownSpin);
      activeViewer.render();
    } catch (e) {}
  }

  function toggleSpin() {
    if (spinPaused) resumeSpin();
    else pauseSpin();
    return !spinPaused;   // returns true if now spinning
  }

  function isSpinning() { return !spinPaused; }

  function stopActive() {
    if (activeViewer && activeViewer.stopAnimate) {
      try { activeViewer.stopAnimate(); } catch (e) {}
    }
    activeViewer = null;
  }

  // ---------- Render ----------
  function renderModel(model, format, container, metaHtml) {
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
        '<div class="mol-empty">3D viewer failed to load (3Dmol.js CDN)</div>';
      return;
    }

    // Let the DOM lay out the canvas before WebGL init
    setTimeout(function () {
      try {
        var viewer = window.$3Dmol.createViewer(canvas, {
          backgroundColor: 'rgba(20,15,45,0.55)',
          antialias: false
        });

        activeViewer = viewer;

        viewer.addModel(model, format);

        viewer.setStyle({}, {
          cartoon: {
            color: 'spectrum',
            arrows: true,
            tubes: true,
            thickness: 0.5
          }
        });

        try {
          viewer.setStyle(
            { hetflag: true },
            {
              stick: { radius: 0.15, colorscheme: 'greenCarbon' },
              sphere: { radius: 0.25 }
            }
          );
        } catch (e) {}

        viewer.zoomTo();
        viewer.zoom(1.05);
        // Respect the current pause state
        if (spinPaused) {
          viewer.spin('y', 0);
        } else {
          viewer.spin('y', lastKnownSpin);
        }
        viewer.render();

        // Force a resize after layout
        setTimeout(function () {
          try {
            viewer.resize();
            viewer.render();
          } catch (e) {}
        }, 200);

        // Metadata line
        var meta = document.createElement('div');
        meta.className = 'mol-meta';
        meta.innerHTML = metaHtml;
        container.appendChild(meta);

      } catch (e) {
        console.error("[Structure] render failed:", e);
        container.innerHTML =
          '<div class="mol-empty">Render error: ' + e.message + '</div>';
      }
    }, 80);
  }

  // ---------- Try one protein ----------
  function tryOne(acc, container) {
    return getPDBIds(acc).then(function (pdbIds) {
      if (!pdbIds || !pdbIds.length) throw new Error("no PDB crossrefs");
      var pdbId = pdbIds[0];
      console.log("[Structure] Trying PDB", pdbId, "for", acc);
      return fetchBCIF(pdbId).then(function (buf) {
        renderModel(buf, 'bcif', container,
          '🧬 <strong>Experimental structure</strong> · ' +
          'PDB <a href="https://www.rcsb.org/structure/' + pdbId +
          '" target="_blank">' + pdbId + '</a>' +
          (pdbIds.length > 1
            ? ' · +' + (pdbIds.length - 1) + ' more' : '') +
          ' · from ' + acc);
        return true;
      });
    }).catch(function (e) {
      console.log("[Structure] PDB failed:", e.message, "→ AlphaFold");
      return fetchAlphaFold(acc).then(function (pdbText) {
        renderModel(pdbText, 'pdb', container,
          '🧬 <strong>Predicted structure</strong> · ' +
          '<a href="https://alphafold.ebi.ac.uk/entry/' + acc +
          '" target="_blank">AlphaFold DB</a> · ' + acc);
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

  // ---------- Entry for search result set ----------
  function renderFromSearch(proteins, container) {
    container.innerHTML =
      '<div class="mol-loading">Finding a representative structure…' +
      '<div class="loading-bar"></div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:8px">' +
      'Trying up to 5 proteins from your search</div></div>';

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
    isSpinning: isSpinning,
    renderFromSearch: renderFromSearch,
    getPDBIds: getPDBIds,
    tryOne: tryOne,
    render: function (acc, container) { tryOne(acc, container); }
  };
  console.log('[Structure] ready v34');
})();
