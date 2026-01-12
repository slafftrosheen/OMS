// src/lib/profiles/utils/generateProfilePDF.ts
import jsPDF from 'jspdf';
import type { ProfileConfiguration } from '$lib/profiles/types';

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

  const sections = Object.entries(options.configuration);

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
    Object.entries(sectionData as Record<string, any>).forEach(([fieldKey, fieldValue]) => {
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

  return pdf.output('blob');
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
