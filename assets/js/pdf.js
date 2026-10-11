// pdf.js — export protein card as PDF (client-side)
(function () {
  function exportElement(el, accession) {
    if (!window.html2canvas || !window.jspdf) {
      alert("PDF libraries not loaded yet — try again in a moment.");
      return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var btn = el.querySelector(".pdf-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Rendering…"; }

    window.html2canvas(el, {
      backgroundColor: "#1e1b4b",
      scale: 2,
      useCORS: true,
      logging: false
    }).then(function (canvas) {
      var imgData = canvas.toDataURL("image/png");
      var pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
      });
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      var imgW = canvas.width * ratio;
      var imgH = canvas.height * ratio;
      var x = (pageW - imgW) / 2;
      var y = 20;

      // Header
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text("Provenance Tracker — " + accession, 20, 15);
      pdf.text("Generated " + new Date().toISOString().slice(0, 10), pageW - 130, 15);

      // Body
      pdf.addImage(imgData, "PNG", x, y, imgW, imgH - 40);

      // Footer
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text("Source: github.com/22014160-023-cmd/provenance-tracker",
               20, pageH - 12);

      pdf.save("provenance-" + accession + ".pdf");
      if (btn) { btn.disabled = false; btn.textContent = "📄 Export PDF"; }
    }).catch(function (e) {
      console.error(e);
      alert("PDF export failed: " + e.message);
      if (btn) { btn.disabled = false; btn.textContent = "📄 Export PDF"; }
    });
  }

  window.PDFExport = { exportElement: exportElement };
  console.log("[PDFExport] ready");
})();
