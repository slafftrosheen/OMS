// src/lib/profiles/utils/generateProfilePDF.ts
import { jsPDF } from 'jspdf';
import type { ProfileConfiguration } from '$lib/profiles/types';
import { readFaceMaterials, withFaceMaterials, type FaceMaterialSelection } from '$lib/profiles/face-materials';

export interface PDFGenerationOptions {
  poNumber: string;
  profileCode: string;
  profileName: string;
  quantity: number;
  configuration: ProfileConfiguration;
  deliveryDate?: string;
  clientInfo?: {
    name: string;
    address: string;
    country: string;
  };
}

export async function generateProfilePDF(options: PDFGenerationOptions): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Header: "invoice" in red
  pdf.setTextColor(255, 0, 0);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text('invoice', 20, 20);

  // PO Number
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(18);
  pdf.text(options.poNumber, 20, 30);

  // Quantity buttons (left side)
  const quantityColors = [
    [229, 62, 62],   // Red
    [59, 130, 246],  // Blue
    [16, 185, 129],  // Green
    [147, 51, 234]   // Purple
  ];

  for (let i = 0; i < options.quantity && i < 4; i++) {
    const y = 50 + (i * 12);
    const [r, g, b] = quantityColors[i];
    pdf.setFillColor(r, g, b);
    pdf.rect(15, y, 20, 10, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${i + 1} ${i === 0 ? 'pc' : 'pcs'}`, 25, y + 7, { align: 'center' });
  }

  // Profile badge (magenta)
  pdf.setFillColor(233, 30, 99); // Magenta
  pdf.roundedRect(70, 47, 35, 10, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Profile ${options.profileCode}`, 87.5, 54, { align: 'center' });

  // Profile type text
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(12);
  pdf.text('OUTDOOR SIGN / INDOOR SIGN', 110, 54);

  // Sections (horizontal layout with black headers)
  let sectionX = 40;
  const sectionY = 65;
  const sectionWidth = 40;
  const sectionHeight = 80;

  const sections = Object.entries(options.configuration).filter(([, value]) =>
    value && typeof value === 'object' && !Array.isArray(value));

  sections.forEach(([sectionName, sectionData], index) => {
    // Section header (black background)
    pdf.setFillColor(26, 26, 26);
    pdf.rect(sectionX, sectionY, sectionWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text(sectionName.toUpperCase(), sectionX + sectionWidth / 2, sectionY + 5, { align: 'center' });

    // Section content (white background)
    pdf.setFillColor(255, 255, 255);
    pdf.rect(sectionX, sectionY + 8, sectionWidth, sectionHeight - 8);

    // Field values
    let fieldY = sectionY + 13;
    const fields = sectionName === 'CNC_FREZER' && Array.isArray(sectionData.faceMaterials)
      ? withFaceMaterials(sectionData, readFaceMaterials(sectionData)) : sectionData;
    Object.entries(fields as Record<string, any>).forEach(([fieldKey, fieldValue]) => {
      // Row details get a complete, paginated schedule below. Picker metadata
      // must never appear as [object Object] or opaque option arrays in print.
      if (fieldKey === 'faceMaterials' || /^(face|back|sides)(Category|ThicknessOptions)$/.test(fieldKey)) return;
      if (fieldValue && fieldY < sectionY + sectionHeight - 5) {
        // Draw colored box for visual fields
        if (fieldKey.includes('material') || fieldKey.includes('color')) {
          const boxColor = getFieldBoxColor(fieldKey, fieldValue);
          pdf.setFillColor(boxColor[0], boxColor[1], boxColor[2]);
          pdf.rect(sectionX + 2, fieldY, sectionWidth - 4, 6, 'F');
          pdf.setDrawColor(0, 0, 0);
          pdf.setLineWidth(0.5);
          pdf.rect(sectionX + 2, fieldY, sectionWidth - 4, 6);
          
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(7);
          pdf.setFont('courier', 'bold');
          pdf.text(String(fieldValue), sectionX + sectionWidth / 2, fieldY + 4, { align: 'center' });
          
          fieldY += 8;
        } else {
          // Regular text field
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(6);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`${fieldKey}: ${fieldValue}`, sectionX + 2, fieldY);
          fieldY += 4;
        }
      }
    });

    sectionX += sectionWidth + 2;
  });

  // Delivery date box (right side, black background)
  if (options.deliveryDate) {
    pdf.setFillColor(26, 26, 26);
    pdf.rect(pageWidth - 40, sectionY, 35, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.text('DELIVERY', pageWidth - 22.5, sectionY + 5, { align: 'center' });
    
    pdf.setFillColor(255, 255, 255);
    pdf.rect(pageWidth - 40, sectionY + 8, 35, 12);
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(options.deliveryDate, pageWidth - 22.5, sectionY + 15, { align: 'center' });
  }

  // Client info (bottom right)
  if (options.clientInfo) {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Reklaidat BV', pageWidth - 50, pageHeight - 25);
    pdf.text('Weijthaweg 31', pageWidth - 50, pageHeight - 20);
    pdf.text('5741 TA BEEK EN DONK', pageWidth - 50, pageHeight - 15);
    pdf.text('THE NETHERLANDS', pageWidth - 50, pageHeight - 10);
  }

  const faceMaterials = readFaceMaterials(options.configuration.CNC_FREZER)
    .filter(row => row.value.trim());
  if (faceMaterials.length > 1) appendFaceMaterialSchedule(pdf, faceMaterials, options);

  return pdf.output('blob');
}

/** The compact work-form column cannot fit an arbitrary number of FACE rows. */
function appendFaceMaterialSchedule(pdf: jsPDF, rows: FaceMaterialSelection[], options: PDFGenerationOptions) {
  const margin = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const materialX = 38;
  const thicknessX = pageWidth - 54;
  const lineHeight = 5;
  let y = 0;

  function startPage() {
    pdf.addPage();
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text('FACE materials', margin, 20);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const heading = pdf.splitTextToSize(
      `${options.poNumber} / ${options.profileName || options.profileCode}`,
      pageWidth - margin * 2
    );
    pdf.text(heading, margin, 28);
    y = 31 + heading.length * lineHeight;
    pdf.setFont('helvetica', 'bold');
    pdf.text('#', margin, y);
    pdf.text('Material', materialX, y);
    pdf.text('Thickness', thicknessX, y);
    pdf.setDrawColor(180, 180, 180);
    pdf.line(margin, y + 3, pageWidth - margin, y + 3);
    y += 10;
    pdf.setFont('helvetica', 'normal');
  }

  startPage();
  rows.forEach((row, index) => {
    const materialLines: string[] = pdf.splitTextToSize(row.value, thicknessX - materialX - 8);
    const thicknessLines: string[] = pdf.splitTextToSize(row.thickness || '-', pageWidth - thicknessX - margin);
    const lineCount = Math.max(materialLines.length, thicknessLines.length);
    let offset = 0;
    while (offset < lineCount) {
      if (y + lineHeight > pageHeight - margin) startPage();
      const count = Math.min(lineCount - offset, Math.max(1, Math.floor((pageHeight - margin - y) / lineHeight)));
      pdf.text(String(index + 1), margin, y);
      const materialChunk = materialLines.slice(offset, offset + count);
      const thicknessChunk = thicknessLines.slice(offset, offset + count);
      if (materialChunk.length) pdf.text(materialChunk, materialX, y);
      if (thicknessChunk.length) pdf.text(thicknessChunk, thicknessX, y);
      offset += count;
      y += count * lineHeight + 4;
    }
  });
}

function getFieldBoxColor(fieldKey: string, value: any): [number, number, number] {
  // Material/color color mapping
  if (fieldKey.includes('opal') || value?.materialCode?.includes('WN071')) {
    return [245, 245, 240]; // Off-white
  }
  if (fieldKey.includes('alu') || value?.materialCode?.startsWith('ALU')) {
    return [192, 192, 192]; // Silver
  }
  if (fieldKey.includes('color') && typeof value === 'string') {
    // RAL color - convert hex to RGB
    const hex = value.startsWith('#') ? value : `#${value}`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }
  return [229, 231, 235]; // Default gray
}
