// Millimetres and points match the plain A4 print styles in styles.css.
const QUANTITY_REPORT_LAYOUT = {
    margin: 18,
    columnWidths: [12, 24, 24, 16, 16, 18, 64],
    fontSize: 9,
    titleSize: 16.5,
    lineHeight: 4.7625,
    paragraphGap: 3.175,
    sectionGap: 5.2917
};

let quantityReportFontReady;
function loadQuantityReportFont() {
    // Reuse the PDF font in browser printing, including from a local file offline.
    if (!quantityReportFontReady) {
        const font = new FontFace('BlocksReport', `url(data:font/ttf;base64,${PDF_REPORT_FONT_BASE64})`);
        document.fonts.add(font);
        quantityReportFontReady = font.load();
    }
    return quantityReportFontReady;
}

function createPdfReport(rows, warnings) {
    const content = getQuantityReportContent(rows, warnings);
    const layout = QUANTITY_REPORT_LAYOUT;
    const doc = new window.jspdf.jsPDF({orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true});
    doc.addFileToVFS('NotoSans-Regular.ttf', PDF_REPORT_FONT_BASE64);
    doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    doc.setFont('NotoSans', 'normal');
    doc.setLineHeightFactor(1.5);
    doc.setProperties({title: content.title, creator: 'BlocksCalculator'});

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = layout.margin;
    doc.setFontSize(layout.titleSize);
    doc.setTextColor(0);
    doc.text(content.title, margin, margin + 3.7, {baseline: 'top'});
    doc.autoTable({
        startY: margin + 8.7313 + layout.sectionGap,
        margin: {top: margin, right: margin, bottom: margin, left: margin},
        head: [content.headers],
        body: content.body,
        theme: 'plain',
        rowPageBreak: 'avoid',
        styles: {font: 'NotoSans', fontStyle: 'normal', fontSize: layout.fontSize, cellPadding: 2.249,
            textColor: 0, fillColor: 255, lineColor: 136, lineWidth: 0.2646,
            overflow: 'linebreak', halign: 'left', valign: 'middle'},
        headStyles: {fontStyle: 'normal', textColor: 0, fillColor: 255},
        columnStyles: Object.fromEntries(layout.columnWidths.map((width, i) => [i, {cellWidth: width}]))
    });

    // As in print: one totals paragraph followed by the model notes, with no extra header or footer.
    let y = doc.lastAutoTable.finalY + layout.sectionGap + 2;
    doc.setFontSize(layout.fontSize);
    for (const paragraph of [content.total, ...content.notes]) {
        const lines = doc.splitTextToSize(paragraph, pageWidth - 2 * margin);
        for (const line of lines) {
            if (y + layout.lineHeight > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }
            doc.text(line, margin, y, {baseline: 'top'});
            y += layout.lineHeight;
        }
        y += layout.paragraphGap;
    }
    return new Uint8Array(doc.output('arraybuffer'));
}

async function exportPdf() {
    const rows = getProjectReport();
    if (!rows) return;
    const warnings = validateProject().warnings;
    let writable;
    try {
        const name = 'blocks-quantities.pdf';
        let handle;
        if (typeof window.showSaveFilePicker === 'function') {
            // Open immediately after the click, before PDF generation can expire user activation.
            try {
                handle = await window.showSaveFilePicker({
                    suggestedName: name,
                    types: [{description: 'PDF document', accept: {'application/pdf': ['.pdf']}}]
                });
            } catch (error) {
                if (error.name === 'AbortError') return; // Cancel means no download or error notice.
                throw error;
            }
        }
        const bytes = createPdfReport(rows, warnings);
        if (handle) {
            writable = await handle.createWritable();
            await writable.write(bytes);
            await writable.close();
            writable = null;
            showToast('PDF saved.');
        } else {
            downloadFile(name, bytes, 'application/pdf');
            showToast('PDF downloaded. To choose a folder, enable "Ask where to save each file" in your browser settings.');
        }
    } catch (error) {
        if (writable) {
            try { await writable.abort(); } catch { /* Preserve the original save error. */ }
        }
        console.error('PDF export failed:', error);
        showToast('Could not save the PDF. Please try again.');
    }
}
