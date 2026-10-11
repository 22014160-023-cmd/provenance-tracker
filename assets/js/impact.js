// impact.js — impact analysis for retracted sources
(function () {
  var CFG = window.CONFIG || {};
  var UNIPROT = CFG.UNIPROT_BASE || "https://rest.uniprot.org/uniprotkb";
  var cache = {};   // pmid → { pmids: [...], total: N, proteins: [...] }

  /**
   * Query UniProt for every protein whose cross-references include
   * PubMed:<pmid>.
   * Returns: { total: N, proteins: [{accession, name, organism}, ...] }
   */
  function findAffectedProteins(pmid, maxResults) {
    maxResults = maxResults || 100;
    if (cache[pmid]) return Promise.resolve(cache[pmid]);

    var url = UNIPROT + "/search?query=" +
              encodeURIComponent("xref:pubmed-" + pmid) +
              "&size=" + maxResults + "&format=json&fields=accession,id,protein_name,organism_name";

    console.log("[Impact] searching proteins citing PMID", pmid);

    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("UniProt " + r.status);
        return r.json();
      })
      .then(function (data) {
        var results = data.results || [];
        var proteins = results.map(function (r) {
          return {
            accession: r.primaryAccession || "?",
            name: (r.proteinDescription &&
                   r.proteinDescription.recommendedName &&
                   r.proteinDescription.recommendedName.fullName &&
                   r.proteinDescription.recommendedName.fullName.value) ||
                  r.uniProtkbId || "Unknown",
            organism: (r.organism && r.organism.scientificName) || ""
          };
        });
        var result = {
          total: proteins.length,
          truncated: proteins.length >= maxResults,
          proteins: proteins
        };
        cache[pmid] = result;
        return result;
      });
  }

  /**
   * Extract every unique PMID from a protein record.
   */
  function extractAllPmids(data) {
    var set = {};
    (data.features || []).forEach(function (f) {
      (f.evidences || []).forEach(function (e) {
        var m = (e.source || "").match(/PubMed:(\d+)/);
        if (m) set[m[1]] = true;
        // also check id field
        var m2 = (e.id || "").match(/^(\d+)$/);
        if (m2 && e.source === "PubMed") set[m2[1]] = true;
      });
    });
    return Object.keys(set);
  }

  /**
   * Run impact analysis for one protein:
   *   - get all retracted PMIDs from its features
   *   - for each, find affected proteins
   *   - render a summary
   */
  function analyze(proteinData, retractions, container) {
    var pmids = extractAllPmids(proteinData);
    var retractedPmids = pmids.filter(function (p) {
      return retractions[p] && retractions[p].retracted;
    });

    if (!retractedPmids.length) {
      container.innerHTML =
        '<div class="impact-empty">✅ No retracted sources in this record.</div>';
      return Promise.resolve();
    }

    container.innerHTML =
      '<div class="impact-loading">Analyzing ' + retractedPmids.length +
      ' retracted source' + (retractedPmids.length > 1 ? 's' : '') + '…' +
      '<div class="loading-bar"></div></div>';

    return Promise.all(retractedPmids.map(function (pmid) {
      return findAffectedProteins(pmid, 100).then(function (res) {
        return { pmid: pmid, info: retractions[pmid], result: res };
      });
    })).then(function (analyses) {
      var html = '<div class="impact-title">💥 Impact Analysis</div>';
      var grandTotal = 0;

      analyses.forEach(function (a) {
        grandTotal += a.result.total;
        var info = a.info || {};
        var title = (info.title || "Unknown title").slice(0, 120);
        var journal = info.journal || "";
        var year = info.year || "";

        var list = a.result.proteins.slice(0, 8).map(function (p) {
          return '<div class="impact-protein">' +
            '<a href="?q=' + p.accession + '">' + p.accession + '</a>' +
            '<span class="impact-name">' + p.name + '</span>' +
            '<small>' + p.organism + '</small>' +
          '</div>';
        }).join("");

        var more = a.result.total > 8
          ? '<div class="impact-more">+ ' + (a.result.total - 8) +
            ' more proteins</div>'
          : "";

        html +=
          '<div class="impact-block">' +
            '<div class="impact-pmid">' +
              '<span class="impact-tag">⚠ RETRACTED</span> ' +
              'PubMed:' + a.pmid +
            '</div>' +
            '<div class="impact-paper">' + title +
              (journal ? ' · <em>' + journal + '</em>' : '') +
              (year ? ' (' + year + ')' : '') +
            '</div>' +
            '<div class="impact-count">' +
              '<strong>' + a.result.total + '</strong> ' +
              'protein' + (a.result.total !== 1 ? 's' : '') +
              ' cite this paper in UniProt' +
              (a.result.truncated ? ' (truncated at 100)' : '') +
            '</div>' +
            '<div class="impact-list">' + list + '</div>' +
            more +
          '</div>';
      });

      html +=
        '<div class="impact-total">' +
          '🌍 Total blast radius: <strong>' + grandTotal + '</strong> ' +
          'protein' + (grandTotal !== 1 ? 's' : '') +
          ' across ' + analyses.length + ' retracted source' +
          (analyses.length !== 1 ? 's' : '') +
        '</div>';

      container.innerHTML = html;
    }).catch(function (e) {
      container.innerHTML =
        '<div class="impact-empty">Impact analysis failed: ' +
        e.message + '</div>';
    });
  }

  window.Impact = {
    analyze: analyze,
    extractAllPmids: extractAllPmids,
    findAffectedProteins: findAffectedProteins
  };
  console.log("[Impact] ready");
})();
