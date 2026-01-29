/**
 * PDF Annotation System
 * Allows adding comments, measurements, and markup to PDFs
 */

export interface Annotation {
  id: string;
  type: 'comment' | 'highlight' | 'measurement' | 'arrow' | 'rectangle' | 'circle';
  page: number;
  position: { x: number; y: number };
  dimensions?: { width: number; height: number };
  content?: string;
  color: string;
  author: string;
  createdAt: string;
  resolved: boolean;
}

export interface MeasurementAnnotation extends Annotation {
  type: 'measurement';
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  distance: number;
  unit: 'mm' | 'cm' | 'in';
}

/**
 * Create annotation on PDF
 */
export function createAnnotation(
  type: Annotation['type'],
  page: number,
  position: { x: number; y: number },
  author: string,
  content?: string
): Annotation {
  return {
    id: `ann_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    page,
    position,
    content,
    color: getDefaultColor(type),
    author,
    createdAt: new Date().toISOString(),
    resolved: false
  };
}

/**
 * Render annotation on canvas
 */
export function renderAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number = 1
): void {
  const { type, position, color, content } = annotation;
  
  ctx.save();
  
  switch (type) {
    case 'comment':
      renderComment(ctx, position, color, content || '', scale);
      break;
    case 'highlight':
      renderHighlight(ctx, annotation, scale);
      break;
    case 'measurement':
      renderMeasurement(ctx, annotation as MeasurementAnnotation, scale);
      break;
    case 'arrow':
      renderArrow(ctx, annotation, scale);
      break;
    case 'rectangle':
      renderRectangle(ctx, annotation, scale);
      break;
    case 'circle':
      renderCircle(ctx, annotation, scale);
      break;
  }
  
  ctx.restore();
}

function renderComment(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  color: string,
  content: string,
  scale: number
): void {
  const x = position.x * scale;
  const y = position.y * scale;
  const size = 24 * scale;
  
  // Draw pin icon
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw text background if hovering
  if (content) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(x + size, y - size, 200 * scale, 60 * scale);
    
    ctx.fillStyle = '#000';
    ctx.font = `${12 * scale}px sans-serif`;
    ctx.fillText(content, x + size + 10, y - size + 20);
  }
}

function renderHighlight(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
): void {
  if (!annotation.dimensions) return;
  
  ctx.fillStyle = `${annotation.color}40`; // 25% opacity
  ctx.fillRect(
    annotation.position.x * scale,
    annotation.position.y * scale,
    annotation.dimensions.width * scale,
    annotation.dimensions.height * scale
  );
}

function renderMeasurement(
  ctx: CanvasRenderingContext2D,
  annotation: MeasurementAnnotation,
  scale: number
): void {
  const { startPoint, endPoint, distance, unit } = annotation;
  
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = 2 * scale;
  
  // Draw line
  ctx.beginPath();
  ctx.moveTo(startPoint.x * scale, startPoint.y * scale);
  ctx.lineTo(endPoint.x * scale, endPoint.y * scale);
  ctx.stroke();
  
  // Draw endpoints
  [startPoint, endPoint].forEach(point => {
    ctx.beginPath();
    ctx.arc(point.x * scale, point.y * scale, 4 * scale, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // Draw measurement text
  const midX = (startPoint.x + endPoint.x) / 2 * scale;
  const midY = (startPoint.y + endPoint.y) / 2 * scale;
  
  ctx.fillStyle = 'white';
  ctx.fillRect(midX - 30 * scale, midY - 12 * scale, 60 * scale, 24 * scale);
  
  ctx.fillStyle = annotation.color;
  ctx.font = `bold ${14 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${distance.toFixed(1)} ${unit}`, midX, midY + 4 * scale);
}

function renderArrow(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
): void {
  if (!annotation.dimensions) return;
  
  const startX = annotation.position.x * scale;
  const startY = annotation.position.y * scale;
  const endX = (annotation.position.x + annotation.dimensions.width) * scale;
  const endY = (annotation.position.y + annotation.dimensions.height) * scale;
  
  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.color;
  ctx.lineWidth = 3 * scale;
  
  // Draw line
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  
  // Draw arrowhead
  const angle = Math.atan2(endY - startY, endX - startX);
  const headLength = 15 * scale;
  
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLength * Math.cos(angle - Math.PI / 6),
    endY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - headLength * Math.cos(angle + Math.PI / 6),
    endY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function renderRectangle(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
): void {
  if (!annotation.dimensions) return;
  
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = 2 * scale;
  ctx.strokeRect(
    annotation.position.x * scale,
    annotation.position.y * scale,
    annotation.dimensions.width * scale,
    annotation.dimensions.height * scale
  );
}

function renderCircle(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
): void {
  if (!annotation.dimensions) return;
  
  const centerX = (annotation.position.x + annotation.dimensions.width / 2) * scale;
  const centerY = (annotation.position.y + annotation.dimensions.height / 2) * scale;
  const radius = Math.min(annotation.dimensions.width, annotation.dimensions.height) / 2 * scale;
  
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function getDefaultColor(type: Annotation['type']): string {
  const colors = {
    comment: '#FF6B6B',
    highlight: '#FFD93D',
    measurement: '#4ECDC4',
    arrow: '#95E1D3',
    rectangle: '#AA96DA',
    circle: '#FCBAD3'
  };
  return colors[type];
}

/**
 * Calculate distance between two points
 */
export function calculateDistance(
  start: { x: number; y: number },
  end: { x: number; y: number },
  pixelsPerUnit: number
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const pixels = Math.sqrt(dx * dx + dy * dy);
  return pixels / pixelsPerUnit;
}

/**
 * Export annotations to JSON
 */
export function exportAnnotations(annotations: Annotation[]): string {
  return JSON.stringify(annotations, null, 2);
}

/**
 * Import annotations from JSON
 */
export function importAnnotations(json: string): Annotation[] {
  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to import annotations:', error);
    return [];
  }
}
