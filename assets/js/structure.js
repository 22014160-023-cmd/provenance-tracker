// structure.js — PyMOL-style 3D viewer with smart protein selection
(function () {
  var cache = {};
  var pdbIndexCache = {};

  // ---- RCSB PDB lookup by UniProt accession ----
  function findPDB(acc) {
    if (pdbIndexCache[acc]) return Promise.resolve(pdbIndexCache[acc]);

    var url = "https://search.rcsb.org/rcsbsearch/v2/query";
    var payload = {
      query: {
        type: "terminal",
        service: "text",
        parameters: {
          attribute: "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession",
          operator: "exact_match",
          value: acc.toUpperCase()
        }
      },
      return_type: "entry",
      request_options: {
        paginate: { start: 0, limit: 5 },
        results_content_type: ["experimental"],
        sort: [
          { sort_by: "rcsb_accession_info.deposit_date",
            direction: "desc" }
        ]
      }
    };

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.result_set || !data.result_set.length) return null;
        var ids = data.result_set.map(function (hit) { return hit.identifier; });
        pdbIndexCache[acc] = ids;
        return ids;
      })
      .catch(function () { return null; });
  }

  function fetchPDB(pdbId) {
    return fetch("https://files.rcsb.org/download/" + pdbId + ".pdb")
      .then(function (r) {
        if (!r.ok) throw new Error("PDB " + r.status);
        return r.text();
      });
  }

  function fetchAlphaFold(acc) {
    var urls = [
      "https://alphafold.ebi.ac.uk/files/AF-" + acc.toUpperCase() + "-F1-model_v4.pdb",
      "https://alphafold.ebi.ac.uk/files/AF-" + acc.toUpperCase() + "-F1-model_v3.pdb"
    ];
    return urls.reduce(function (chain, u) {
      return chain.catch(function () {
        return fetch(u).then(function (r) {
          if (!r.ok) throw new Error("AlphaFold " + r.status);
          return r.text();
        });
      });
    }, Promise.reject());
  }

  // ---- Render with PyMOL-style cartoon + sticks ----
  function renderModel(pdb, container, metaHtml) {
    container.innerHTML = '';
    var canvas = document.createElement('div');
    canvas.className = 'mol-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    if (!window.$3Dmol) {
      container.innerHTML = '<div class="mol-empty">3D viewer unavailable.</div>';
      return;
    }

    var viewer = window.$3Dmol.createViewer(canvas, {
      backgroundColor: 'rgba(20,15,45,0.55)',
      antialias: true
    });
    viewer.addModel(pdb, 'pdb');

    // PyMOL-style cartoon
    viewer.setStyle({}, {
      cartoon: {
        color: 'spectrum',
        arrows: true,
        tubes: true,
        thickness: 0.5
      }
    });
    // Heteroatoms as green-carbon sticks
    viewer.setStyle(
      { hetflag: true },
      {
        stick: { radius: 0.15, colorscheme: 'greenCarbon' },
        sphere: { radius: 0.25 }
      }
    );

    viewer.setBackgroundColor('rgba(20,15,45,0.55)');
    viewer.zoomTo();
    viewer.zoom(1.05);
    viewer.spin('y', 0.6);
    viewer.render();

    var meta = document.createElement('div');
    meta.className = 'mol-meta';
    meta.innerHTML = metaHtml;
    container.appendChild(meta);
  }

  // ---- Try one accession end-to-end ----
  function tryOne(acc, container) {
    return findPDB(acc).then(function (pdbIds) {
      if (!pdbIds || !pdbIds.length) throw new Error("no PDB");
      return fetchPDB(pdbIds[0]).then(function (pdb) {
        renderModel(pdb, container,
          '🧬 <strong>Experimental structure</strong> · ' +
          'PDB <a href="https://www.rcsb.org/structure/' + pdbIds[0] +
          '" target="_blank">' + pdbIds[0] + '</a>' +
          (pdbIds.length > 1 ? ' · +' + (pdbIds.length - 1) + ' more' : '') +
          ' · showing ' + acc);
        return true;
      });
    }).catch(function () {
      return fetchAlphaFold(acc).then(function (pdb) {
        renderModel(pdb, container,
          '🧬 <strong>Predicted structure</strong> · ' +
          '<a href="https://alphafold.ebi.ac.uk/entry/' + acc +
          '" target="_blank">AlphaFold DB</a> · showing ' + acc);
        return true;
      }).catch(function () { return false; });
    });
  }

  // ---- Pick a display protein from the search results ----
  // Rules:
  //   1. If only one protein → use it
  //   2. Prefer proteins with the most features (most studied)
  //   3. Try top 3, fall back gracefully
  function rankCandidates(proteins) {
    // Only consider proteins that have a MINIMUM of features.
    // Garbage-search results (e.g. random words) often return
    // entries with 1-2 features and no PDB structure.
    // Filter them out before ranking.
    var viable = proteins.filter(function (p) {
      var featCount = (p.features || []).length;
      var seqLen = (p.sequence && p.sequence.length) || 0;
      return featCount >= 3 || seqLen >= 100;
    });

    // If nothing passes the filter, use the full set as fallback
    if (!viable.length) viable = proteins.slice();

    return viable.slice().sort(function (a, b) {
      var aReviewed = a.entryType && a.entryType.indexOf("reviewed") >= 0 ? 1 : 0;
      var bReviewed = b.entryType && b.entryType.indexOf("reviewed") >= 0 ? 1 : 0;
      var aLen = (a.sequence && a.sequence.length) || 0;
      var bLen = (b.sequence && b.sequence.length) || 0;
      var aFeat = (a.features || []).length;
      var bFeat = (b.features || []).length;
      // weighted score
      var aScore = aReviewed * 500 + aFeat * 10 + Math.min(aLen, 2000);
      var bScore = bReviewed * 500 + bFeat * 10 + Math.min(bLen, 2000);
      return bScore - aScore;
    });
  }

  // ---- Main: render whatever protein has a structure ----
  function renderFromSearch(proteins, container) {
    container.innerHTML =
      '<div class="mol-loading">Finding a representative structure…' +
      '<div class="loading-bar"></div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:8px">' +
      'Trying up to 5 proteins from your search</div>' +
      '</div>';

    var ranked = rankCandidates(proteins).slice(0, 5);
    var idx = 0;

    function tryNext() {
      if (idx >= ranked.length) {
        renderPlaceholder(proteins[0].primaryAccession, container);
        return;
      }
      var acc = ranked[idx].primaryAccession;
      idx++;
      console.log("[Structure] Trying", acc);

      tryOne(acc, container).then(function (ok) {
        if (!ok) tryNext();
      }).catch(tryNext);
    }

    tryNext();
  }

  // ---- Placeholder when nothing is available ----
  function renderPlaceholder(acc, container) {
    container.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.style.cssText =
      'width:100%;height:100%;display:flex;align-items:center;' +
      'justify-content:center;position:relative;min-height:360px;';

    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    svg.style.cssText =
      'width:200px;height:200px;' +
      'animation:spin3d 6s linear infinite;' +
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

    var label = document.createElement('div');
    label.style.cssText =
      'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);' +
      'font-size:11px;color:rgba(255,255,255,0.55);text-align:center;' +
      'letter-spacing:0.3px;max-width:90%;';
    label.innerHTML =
      'No experimental or predicted structure found for this search<br>' +
      '<span style="font-size:10.5px;opacity:0.8">' +
      'Try a specific protein like P04637 or P00533</span>';
    wrap.appendChild(label);

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
    render: function (acc, container) {
      // Compat: single accession call
      var fake = [{ primaryAccession: acc, features: [], sequence: {} }];
      renderFromSearch(fake, container);
    },
    renderFromSearch: renderFromSearch,
    findPDB: findPDB
  };
  console.log('[Structure] ready v5 — smart pick, RCSB-first');
})();
