// api.js v6
(function () {
  var CFG = window.CONFIG || {};
  var UNIPROT_BASE = CFG.UNIPROT_BASE || "https://rest.uniprot.org/uniprotkb";
  var CROSSREF_BASE = CFG.CROSSREF || "https://api.crossref.org/works";

  function fetchProtein(acc) {
    var url = UNIPROT_BASE + "/" + encodeURIComponent(acc) + ".json";
    console.log("[UniProt] fetchProtein:", url);
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          throw new Error("UniProt " + r.status + ": " + t.slice(0, 120));
        });
        return r.json();
      });
  }

  function searchProteins(q, limit) {
    var term = (q || "").trim();
    if (!term) return Promise.reject(new Error("Empty search"));
    var size = Math.max(1, Math.min(500, limit || 5));
    var query = encodeURIComponent("(" + term + ")");
    var url = UNIPROT_BASE + "/search?query=" + query +
              "&size=" + size + "&format=json";
    console.log("[UniProt] search:", url);
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          throw new Error("UniProt " + r.status + ": " + t.slice(0, 200));
        });
        return r.json();
      })
      .then(function (d) { return d.results || []; });
  }

  function checkRetraction(doi) {
    return fetch(CROSSREF_BASE + "/" + encodeURIComponent(doi))
      .then(function (r) {
        if (!r.ok) return { retracted: false, status: r.status };
        return r.json().then(function (d) {
          var u = d.message["update-to"] || [];
          return { retracted: u.some(function (x) { return x.type === "retraction"; }),
                   updates: u };
        });
      });
  }

  window.BioAPI = {
    fetchProtein: fetchProtein,
    searchProteins: searchProteins,
    checkRetraction: checkRetraction
  };
  console.log("[BioAPI] ready");
})();
