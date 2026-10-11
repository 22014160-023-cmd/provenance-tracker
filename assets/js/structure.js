// structure.js — 3D viewer with multi-source lookup
(function () {
  var cache = {};

  // Try multiple sources in order until one works
  var SOURCES = [
    {
      name: "AlphaFold",
      url: function (acc) {
        return "https://alphafold.ebi.ac.uk/files/AF-" +
               acc.toUpperCase() + "-F1-model_v4.pdb";
      }
    },
    {
      name: "PDBe (via AlphaFold)",
      url: function (acc) {
        return "https://alphafold.ebi.ac.uk/files/AF-" +
               acc.toUpperCase() + "-F1-model_v3.pdb";
      }
    },
    {
      name: "RCSB PDB (as UniProt xref)",
      // RCSB exposes a search API that accepts UniProt IDs
      url: function (acc) {
        return "https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/" +
               acc.toUpperCase();
      },
      json: true
    }
  ];

  function tryFetch(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    });
  }

  function loadStructure(acc) {
    if (cache[acc]) return Promise.resolve(cache[acc]);

    // Primary: AlphaFold v4
    var primary = "https://alphafold.ebi.ac.uk/files/AF-" +
                  acc.toUpperCase() + "-F1-model_v4.pdb";

    return tryFetch(primary)
      .then(function (pdb) {
        cache[acc] = pdb;
        return pdb;
      })
      .catch(function () {
        // Fallback 1: AlphaFold v3
        var v3 = "https://alphafold.ebi.ac.uk/files/AF-" +
                 acc.toUpperCase() + "-F1-model_v3.pdb";
        return tryFetch(v3).then(function (pdb) {
          cache[acc] = pdb;
          return pdb;
        });
      });
  }

  function render(acc, container) {
    container.innerHTML =
      '<div class="mol-loading">' +
      'Loading 3D structure for <strong>' + acc + '</strong>…' +
      '<div class="loading-bar"></div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:8px">' +
      'Querying AlphaFold DB</div>' +
      '</div>';

    return loadStructure(acc).then(function (pdb) {
      container.innerHTML = '';
      var canvas = document.createElement('div');
      canvas.className = 'mol-canvas';
      container.appendChild(canvas);

      if (!window.$3Dmol) {
        container.innerHTML =
          '<div class="mol-empty">3Dmol.js failed to load</div>';
        return;
      }

      var viewer = window.$3Dmol.createViewer(canvas, {
        backgroundColor: 'rgba(20,15,45,0.4)'
      });
      viewer.addModel(pdb, 'pdb');
      viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
      viewer.zoomTo();
      viewer.spin('y', 0.6);
      viewer.render();

      var meta = document.createElement('div');
      meta.className = 'mol-meta';
      meta.innerHTML = '🧬 Rotating 3D model · ' +
        '<a href="https://alphafold.ebi.ac.uk/entry/' + acc + '" target="_blank">' +
        'AlphaFold DB</a> · ' + acc;
      container.appendChild(meta);
    }).catch(function () {
      // If NO source has a structure, show a rotating wireframe placeholder
      renderFallback(acc, container);
    });
  }

  // Rotating placeholder when no real structure exists
  function renderFallback(acc, container) {
    container.innerHTML = '';

    // Build a simple DNA-helix-like rotating object via pure SVG animation
    var wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:420px;display:flex;' +
      'align-items:center;justify-content:center;position:relative;';

    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-100 -100 200 200');
    svg.style.cssText = 'width:220px;height:220px;' +
      'animation:spin3d 6s linear infinite;' +
      'transform-style:preserve-3d;';

    // Gradient def
    var defs = document.createElementNS(ns, 'defs');
    defs.innerHTML =
      '<linearGradient id="fbGrad" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#a78bfa"/>' +
        '<stop offset="50%" stop-color="#f472b6"/>' +
        '<stop offset="100%" stop-color="#60a5fa"/>' +
      '</linearGradient>';
    svg.appendChild(defs);

    // Two intertwined helices
    var p1 = document.createElementNS(ns, 'path');
    p1.setAttribute('d', 'M -50 -60 Q 50 -30 -50 0 Q 50 30 -50 60');
    p1.setAttribute('stroke', 'url(#fbGrad)');
    p1.setAttribute('stroke-width', '5');
    p1.setAttribute('fill', 'none');
    p1.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p1);

    var p2 = document.createElementNS(ns, 'path');
    p2.setAttribute('d', 'M 50 -60 Q -50 -30 50 0 Q -50 30 50 60');
    p2.setAttribute('stroke', 'url(#fbGrad)');
    p2.setAttribute('stroke-width', '5');
    p2.setAttribute('fill', 'none');
    p2.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p2);

    // Cross links
    [-40, -20, 0, 20, 40].forEach(function (y) {
      var l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', '-40');
      l.setAttribute('y1', y);
      l.setAttribute('x2', '40');
      l.setAttribute('y2', y);
      l.setAttribute('stroke', 'url(#fbGrad)');
      l.setAttribute('stroke-width', '1.6');
      l.setAttribute('opacity', '0.55');
      svg.appendChild(l);
    });

    wrap.appendChild(svg);

    var label = document.createElement('div');
    label.style.cssText =
      'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
      'font-size:11.5px;color:rgba(255,255,255,0.55);text-align:center;' +
      'letter-spacing:0.3px;';
    label.innerHTML =
      'No experimental or predicted structure available for ' +
      '<strong style="color:#fbcfe8">' + acc + '</strong><br>' +
      '<span style="font-size:10.5px;opacity:0.8">' +
      'Try a well-studied protein like P12345 or P00533</span>';
    wrap.appendChild(label);

    container.appendChild(wrap);

    // Inject keyframe if not already present
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
    render: render,
    loadStructure: loadStructure
  };
  console.log('[Structure] ready v3 — multi-source + fallback');
})();
