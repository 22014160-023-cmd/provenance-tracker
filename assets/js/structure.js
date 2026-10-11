// structure.js — AlphaFold 3D viewer + PDF export
(function () {
  var cache = {};

  function loadStructure(accession) {
    if (cache[accession]) return Promise.resolve(cache[accession]);
    var url = "https://alphafold.ebi.ac.uk/files/AF-" +
              encodeURIComponent(accession) + "-F1-model_v4.pdb";
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("AlphaFold " + r.status);
      return r.text();
    }).then(function (pdb) {
      cache[accession] = pdb;
      return pdb;
    });
  }

  function render(accession, container) {
    container.innerHTML = '<div class="mol-loading">Loading 3D model…' +
      '<div class="loading-bar"></div></div>';

    return loadStructure(accession).then(function (pdb) {
      container.innerHTML = '';
      var canvas = document.createElement('div');
      canvas.className = 'mol-canvas';
      canvas.style.width = '100%';
      canvas.style.height = '380px';
      container.appendChild(canvas);

      if (!window.$3Dmol) {
        container.innerHTML = '<div class="mol-empty">' +
          '3D viewer failed to load.</div>';
        return;
      }

      var viewer = window.$3Dmol.createViewer(canvas, {
        backgroundColor: 'rgba(0,0,0,0)'
      });
      viewer.addModel(pdb, 'pdb');
      viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
      viewer.zoomTo();
      viewer.spin('y', 0.6);
      viewer.render();

      var meta = document.createElement('div');
      meta.className = 'mol-meta';
      meta.innerHTML = '🧬 Predicted structure · ' +
        '<a href="https://alphafold.ebi.ac.uk/entry/' + accession +
        '" target="_blank">AlphaFold DB</a> · ' +
        accession;
      container.appendChild(meta);
    }).catch(function (e) {
      container.innerHTML = '<div class="mol-empty">' +
        'No 3D structure available (' + e.message + ')</div>';
    });
  }

  window.Structure = { render: render, loadStructure: loadStructure };
  console.log("[Structure] ready");
})();
