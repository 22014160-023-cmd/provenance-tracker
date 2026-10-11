// pdf.js v2 — real PDF with proper tables
(function () {
  function tierColor(tier) {
    return { high:[34,197,94], medium:[234,179,8], low:[249,115,22],
             very_low:[239,68,68], unknown:[156,163,175] }[tier] || [150,150,150];
  }

  function buildFeaturesTable(proteinData, retractions) {
    var rows = [];
    var features = (proteinData.features || []);
    features.forEach(function (f) {
      var c = window.Evidence.classifyFeature(f);
      var pmids = window.Retraction.extractPmids(f);
      var retracted = pmids.some(function (p) {
        return retractions[p] && retractions[p].retracted;
      });
      var pos = "—";
      if (f.location && f.location.start && f.location.end) {
        pos = f.location.start.value + "–" + f.location.end.value;
      }
      var sources = (f.evidences || [])
        .map(function (e) { return e.source; })
        .filter(Boolean).slice(0, 3).join(", ") || "—";
      rows.push([
        f.type || "—",
        (f.description || "—").slice(0, 80),
        pos,
        c.tier + (retracted ? " ⚠" : ""),
        sources
      ]);
    });
    return rows;
  }

  function exportPDF(proteinData, retractions) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF library not loaded."); return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var acc = proteinData.primaryAccession || "protein";
    var name = (proteinData.proteinDescription &&
                proteinData.proteinDescription.recommendedName &&
                proteinData.proteinDescription.recommendedName.fullName &&
                proteinData.proteinDescription.recommendedName.fullName.value) ||
               proteinData.uniProtkbId || acc;
    var org = (proteinData.organism && proteinData.organism.scientificName) || "";

    // -------- Cover header --------
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, pageW, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Provenance Tracker", 40, 34);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Evidence ancestry and error-propagation report", 40, 54);

    // -------- Protein meta --------
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(name, 40, 100);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 90);
    doc.text(acc + " · " + org, 40, 116);
    doc.text("Generated " + new Date().toISOString().slice(0, 19).replace("T", " "),
             40, 132);

    // -------- Summary pills --------
    var tally = { high:0, medium:0, low:0, very_low:0, unknown:0 };
    (proteinData.features || []).forEach(function (f) {
      var c = window.Evidence.classifyFeature(f);
      tally[c.tier] = (tally[c.tier] || 0) + 1;
    });
    var summaryParts = [];
    Object.keys(tally).forEach(function (k) {
      if (tally[k] > 0) summaryParts.push(tally[k] + " " + k);
    });
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text("Evidence summary: " + summaryParts.join(" · "), 40, 152);

    // -------- Retraction warning --------
    var retractedCount = 0;
    (proteinData.features || []).forEach(function (f) {
      var pmids = window.Retraction.extractPmids(f);
      if (pmids.some(function (p) {
        return retractions[p] && retractions[p].retracted;
      })) retractedCount++;
    });
    var y = 172;
    if (retractedCount > 0) {
      doc.setFillColor(254, 226, 226);
      doc.rect(40, y - 12, pageW - 80, 28, "F");
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("⚠  " + retractedCount + " annotation(s) rely on retracted papers",
               50, y + 6);
      y += 40;
    }

    // -------- Features table --------
    var rows = buildFeaturesTable(proteinData, retractions);
    if (rows.length) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("Feature table (" + rows.length + " rows)", 40, y);
      y += 10;

      doc.autoTable({
        startY: y,
        head: [["Type", "Description", "Pos", "Tier", "Source"]],
        body: rows,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 4, textColor: [30,30,30] },
        headStyles: { fillColor: [79,70,229], textColor: [255,255,255],
                      fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245,246,252] },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 220 },
          2: { cellWidth: 50 },
          3: { cellWidth: 60 },
          4: { cellWidth: 120 }
        },
        margin: { left: 40, right: 40 },
        didParseCell: function (data) {
          if (data.section === "body" && data.column.index === 3) {
            var tier = String(data.cell.raw).split(" ")[0];
            var colors = { high:[34,197,94], medium:[234,179,8],
                           low:[249,115,22], very_low:[239,68,68],
                           unknown:[156,163,175] };
            var c = colors[tier] || [100,100,100];
            data.cell.styles.textColor = c;
            data.cell.styles.fontStyle = "bold";
          }
        }
      });
    } else {
      doc.setFontSize(11);
      doc.setTextColor(120,120,120);
      doc.text("No features in this record.", 40, y + 10);
    }

    // -------- Footer --------
    var pageCount = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Provenance Tracker · github.com/" + "22014160-023-cmd" +
               "/provenance-tracker", 40, pageH - 20);
      doc.text("Page " + i + " of " + pageCount, pageW - 90, pageH - 20);
    }

    doc.save("provenance-" + acc + ".pdf");
  }

  window.PDFExport = { exportPDF: exportPDF };
  console.log("[PDFExport] v2 ready");
})();
