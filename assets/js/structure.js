// structure.js — PyMOL-style viewer with RCSB → AlphaFold → placeholder
(function () {
  var cache = {};

  // ---------- 1) RCSB PDB lookup by UniProt accession ----------
  // Uses RCSB search API to find experimental structures
  function findPDB(acc) {
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
        results_content_type: ["experimental", "computational"],
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
        // Prefer experimental entries (X-ray, NMR, EM)
        var ids = data.result_set.map(function (hit) { return hit.identifier; });
        return ids;
      })
      .catch(function () { return null; });
  }

  // ---------- 2) Fetch PDB structure file ----------
  function fetchPDB(pdbId) {
    var url = "https://files.rcsb.org/download/" + pdbId + ".pdb";
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("PDB " + r.status);
      return r.text();
    });
  }

  // ---------- 3) Fetch AlphaFold as fallback ----------
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

  // ---------- 4) Style: PyMOL-like cartoon + stick ----------
  function applyPyMOLStyle(viewer) {
    // Clear any defaults
    viewer.setStyle({}, {});

    // Cartoon for the backbone — PyMOL default "spectrum" by residue
    viewer.setStyle(
      { "atom": "CA" },
      {
        cartoon: {
          color: "spectrum",
          style: "trace",
          thickness: 0.4
        }
      }
    );

    // Full cartoon for all residues
    viewer.setStyle(
      { "atom": "*" },
      {
        cartoon: {
          color: "spectrum",
          arrows: true,
          tubes: true,
          thickness: 0.5
        }
      }
    );

    // Optional: sticks on the active site residues (hetatms)
    viewer.setStyle(
      { "hetflag": true },
      {
        stick: {
          radius: 0.15,
          colorscheme: "greenCarbon"
        },
        sphere: { radius: 0.3 }
      }
    );

    // Backbone trace for a crisp ribbon silhouette
    viewer.setStyle(
      {},
      {
        cartoon: {
          color: "spectrum",
          opacity: 1.0
        }
      }
    );
  }

  // ---------- 5) Render with metadata ----------
  function renderModel(pdb, container, metaHtml) {
    container.innerHTML = '';

    var canvas = document.createElement('div');
    canvas.className = 'mol-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    if (!window.$3Dmol) {
      container.innerHTML =
        '<div class="mol-empty">3D viewer unavailable.</div>';
      return;
    }

    var viewer = window.$3Dmol.createViewer(canvas, {
      backgroundColor: 'rgba(20,15,45,0.55)',
      antialias: true
    });

    viewer.addModel(pdb, 'pdb');

    // PyMOL-style rendering
    viewer.setStyle({}, {
      cartoon: {
        color: 'spectrum',
        arrows: true,
        tubes: true,
        thickness: 0.5
      }
    });

    // Also show heteroatoms as sticks + spheres
    viewer.setStyle(
      { hetflag: true },
      {
        stick: { radius: 0.15, colorscheme: 'greenCarbon' },
        sphere: { radius: 0.25 }
      }
    );

    // Light-gray background glow
    viewer.setBackgroundColor('rgba(20,15,45,0.55)');

    viewer.zoomTo();
    viewer.zoom(1.1);
    viewer.spin('y', 0.7);
    viewer.render();

    // Metadata line below canvas
    var meta = document.createElement('div');
    meta.className = 'mol-meta';
    meta.innerHTML = metaHtml;
    container.appendChild(meta);
  }

  // ---------- 6) Main entry ----------
  function render(acc, container) {
    container.innerHTML =
      '<div class="mol-loading">' +
      'Loading structure for <strong>' + acc + '</strong>…' +
      '<div class="loading-bar"></div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:8px">' +
      'Trying RCSB PDB → AlphaFold DB</div>' +
      '</div>';

    // Try RCSB PDB first
    return findPDB(acc)
      .then(function (pdbIds) {
        if (!pdbIds || !pdbIds.length) throw new Error("no PDB entries");
        var primary = pdbIds[0];
        console.log("[Structure] Using PDB:", primary);
        return fetchPDB(primary).then(function (pdb) {
          return {
            source: "RCSB PDB",
            pdbId: primary,
            allIds: pdbIds,
            pdb: pdb
          };
        });
      })
      .then(function (result) {
        var meta = '🧬 <strong>Experimental structure</strong> · ' +
                   '<a href="https://www.rcsb.org/structure/' + result.pdbId +
                   '" target="_blank">PDB ' + result.pdbId + '</a>' +
                   (result.allIds.length > 1
                     ? ' · ' + (result.allIds.length - 1) + ' more in PDB'
                     : '');
        renderModel(result.pdb, container, meta);
      })
      .catch(function () {
        // Fallback: AlphaFold
        console.log("[Structure] PDB lookup failed, trying AlphaFold");
        return fetchAlphaFold(acc)
          .then(function (pdb) {
            var meta = '🧬 <strong>Predicted structure</strong> · ' +
                       '<a href="https://alphafold.ebi.ac.uk/entry/' + acc +
                       '" target="_blank">AlphaFold DB</a> · ' + acc;
            renderModel(pdb, container, meta);
          })
          .catch(function () {
            console.log("[Structure] No structure available");
            renderPlaceholder(acc, container);
          });
      });
  }

  // ---------- 7) Rotating DNA placeholder ----------
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

    // Helices
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
      'No experimental or predicted structure for ' +
      '<strong style="color:#fbcfe8">' + acc + '</strong><br>' +
      '<span style="font-size:10.5px;opacity:0.8">' +
      'Try P12345 · P00533 · P04637</span>';
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

  window.Structure = { render: render };
  console.log('[Structure] ready v4 — PyMOL style, RCSB-first');
})();
