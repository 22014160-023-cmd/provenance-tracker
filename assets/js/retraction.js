// retraction.js — detect retracted source papers
(function () {
  var CFG = window.CONFIG || {};
  var NCBI     = CFG.NCBI_EUTILS || "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  var CROSSREF = CFG.CROSSREF    || "https://api.crossref.org/works";
  var NCBI_KEY = CFG.NCBI_API_KEY || "";

  var cache = {};   // pmid → { retracted, doi, title, journal, year, retractionUpdates }

  function checkPmids(pmids) {
    pmids = (pmids || []).filter(Boolean);
    if (!pmids.length) return Promise.resolve({});

    var toFetch = pmids.filter(function (p) { return !cache[p]; });
    if (!toFetch.length) {
      var only = {};
      pmids.forEach(function (p) { if (cache[p]) only[p] = cache[p]; });
      return Promise.resolve(only);
    }

    var keyParam = NCBI_KEY ? "&api_key=" + encodeURIComponent(NCBI_KEY) : "";
    var url = NCBI + "/esummary.fcgi?db=pubmed&id=" + toFetch.join(",") +
              "&retmode=json" + keyParam;

    console.log("[NCBI] esummary:", url.replace(NCBI_KEY, "***"));

    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("NCBI " + r.status);
        return r.json();
      })
      .then(function (data) {
        var result = (data && data.result) || {};
        var pending = [];

        toFetch.forEach(function (pmid) {
          var rec = result[pmid];
          if (!rec) {
            cache[pmid] = { retracted: false, doi: null, title: null,
                            journal: null, year: null, retractionUpdates: [] };
            return;
          }
          var doi = null;
          (rec.articleids || []).forEach(function (a) {
            if (a.idtype === "doi") doi = a.value;
          });
          cache[pmid] = {
            retracted: false,
            doi: doi,
            title: rec.title || null,
            journal: rec.fulljournalname || rec.source || null,
            year: (rec.pubdate || "").slice(0, 4) || null,
            retractionUpdates: []
          };
          if (doi) pending.push({ pmid: pmid, doi: doi });
        });

        return Promise.all(pending.map(function (item) {
          var crUrl = CROSSREF + "/" + encodeURIComponent(item.doi);
          return fetch(crUrl)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
              if (!d) return;
              var updates = (d.message && d.message["update-to"]) || [];
              var retracts = updates.filter(function (u) {
                return u.type === "retraction";
              });
              if (retracts.length) {
                cache[item.pmid].retracted = true;
                cache[item.pmid].retractionUpdates = retracts;
                console.log("[Crossref] RETRACTED:", item.doi);
              }
            })
            .catch(function () {});
        })).then(function () {
          var out = {};
          pmids.forEach(function (p) { if (cache[p]) out[p] = cache[p]; });
          return out;
        });
      });
  }

  function extractPmids(feature) {
    if (!feature || !feature.evidences) return [];
    var out = [];
    feature.evidences.forEach(function (e) {
      var m = (e.source || "").match(/PubMed:(\d+)/);
      if (m) out.push(m[1]);
    });
    return out;
  }

  window.Retraction = {
    checkPmids: checkPmids,
    extractPmids: extractPmids,
    _cache: cache
  };
  console.log("[Retraction] ready");
})();
