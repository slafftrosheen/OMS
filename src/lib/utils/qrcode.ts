/**
 * QR Code generation utility
 * In production, use a library like qrcode or node-qrcode
 */

export interface QRCodeOptions {
  size?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * Generate QR code data URL for an order
 */
export async function generateOrderQR(orderId: string, options: QRCodeOptions = {}): Promise<string> {
  const {
    size = 256,
    margin = 4,
    errorCorrectionLevel = 'M'
  } = options;

  const data = `ORDER:${orderId}`;

  // In production, use a QR library:
  // import QRCode from 'qrcode';
  // return await QRCode.toDataURL(data, { width: size, margin, errorCorrectionLevel });

  // For now, return a placeholder SVG
  return generateQRPlaceholder(data, size);
}

/**
 * Generate QR placeholder SVG (for demo purposes)
 * Replace with actual QR generation in production
 */
function generateQRPlaceholder(data: string, size: number): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="white"/>
      <text x="50" y="50" text-anchor="middle" dominant-baseline="middle" font-size="8" font-family="monospace" fill="black">
        ${data}
      </text>
      <rect x="10" y="10" width="15" height="15" fill="black"/>
      <rect x="75" y="10" width="15" height="15" fill="black"/>
      <rect x="10" y="75" width="15" height="15" fill="black"/>
      <rect x="12" y="12" width="11" height="11" fill="white"/>
      <rect x="77" y="12" width="11" height="11" fill="white"/>
      <rect x="12" y="77" width="11" height="11" fill="white"/>
      <rect x="14" y="14" width="7" height="7" fill="black"/>
      <rect x="79" y="14" width="7" height="7" fill="black"/>
      <rect x="14" y="79" width="7" height="7" fill="black"/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Print QR code label
 */
export function printQRLabel(qrDataUrl: string, orderInfo: { po_number: string; title: string }) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print QR Label - ${orderInfo.po_number}</title>
      <style>
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .label {
          text-align: center;
          border: 2px solid black;
          padding: 20px;
          max-width: 400px;
        }
        .qr-code {
          margin: 20px 0;
        }
        .qr-code img {
          width: 100%;
          max-width: 300px;
          height: auto;
        }
        h1 {
          margin: 0 0 10px 0;
          font-size: 24px;
        }
        p {
          margin: 5px 0;
          font-size: 14px;
        }
        .print-btn {
          margin-top: 20px;
          padding: 10px 20px;
          font-size: 16px;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="label">
        <h1>${orderInfo.po_number}</h1>
        <p>${orderInfo.title}</p>
        <div class="qr-code">
          <img src="${qrDataUrl}" alt="QR Code">
        </div>
        <button class="print-btn no-print" onclick="window.print()">Print Label</button>
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();
}
