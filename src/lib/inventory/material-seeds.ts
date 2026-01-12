import type { MaterialSpec, ColorSpec } from './material-types';

// Sample colors for materials
const sampleColors: ColorSpec[] = [
  {
    id: 'color-1',
    name: 'RAL 9016 Traffic White',
    ralCode: 'RAL 9016',
    hexValue: 'F6F6F6',
    finishType: 'MATTE'
  },
  {
    id: 'color-2',
    name: 'RAL 3020 Traffic Red',
    ralCode: 'RAL 3020',
    hexValue: 'CC0605',
    finishType: 'GLOSS'
  },
  {
    id: 'color-3',
    name: 'RAL 5015 Sky Blue',
    ralCode: 'RAL 5015',
    hexValue: '2874B2',
    finishType: 'GLOSS'
  },
  {
    id: 'color-4',
    name: 'Pantone 185 C',
    pantoneCode: 'Pantone 185 C',
    hexValue: 'E4002B',
    finishType: 'GLOSS'
  }
];

// Sample materials for signage manufacturing
export const sampleMaterials: MaterialSpec[] = [
  {
    id: 'mat-001',
    category: 'COMPOSITE',
    subtype: 'ACM_PANEL',
    name: 'Alucobond A2 3mm',
    brand: 'Alucobond',
    supplier: 'Local Supplier',
    thickness: 3,
    width: 1500,
    length: 4050,
    weatherResistant: true,
    uvRating: 'UV resistant for 10+ years',
    applications: ['Exterior signage', 'Building facades', 'Displays'],
    availableColors: [sampleColors[0], sampleColors[1], sampleColors[2]],
    supportsCustomColor: true,
    unitPrice: 85.50,
    currency: 'EUR',
    pricePerUnit: 'sheet',
    minStockLevel: 10,
    reorderPoint: 15,
    leadTimeDays: 7,
    notes: 'Fire-rated A2 classification',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'mat-002',
    category: 'COMPOSITE',
    subtype: 'DIBOND',
    name: 'Dibond 3mm White',
    brand: 'Dibond',
    supplier: 'SignSupply',
    thickness: 3,
    width: 1500,
    length: 3050,
    weatherResistant: true,
    uvRating: 'Excellent UV resistance',
    applications: ['Indoor/outdoor signage', 'Displays', 'POS'],
    availableColors: [sampleColors[0]],
    supportsCustomColor: false,
    unitPrice: 72.00,
    currency: 'EUR',
    pricePerUnit: 'sheet',
    minStockLevel: 8,
    reorderPoint: 12,
    leadTimeDays: 5,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'mat-003',
    category: 'PLASTIC',
    subtype: 'ACRYLIC',
    name: 'Cast Acrylic Clear 5mm',
    brand: 'Plexiglas',
    supplier: 'PlasticWorld',
    thickness: 5,
    width: 2050,
    length: 3050,
    weatherResistant: true,
    uvRating: 'UV stabilized',
    temperatureRange: '-40°C to +70°C',
    applications: ['Light boxes', 'Displays', 'Protective glazing'],
    supportsCustomColor: false,
    unitPrice: 95.00,
    currency: 'EUR',
    pricePerUnit: 'sheet',
    minStockLevel: 5,
    reorderPoint: 8,
    leadTimeDays: 3,
    notes: 'High optical clarity, easy to fabricate',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'mat-004',
    category: 'SHEET_METAL',
    subtype: 'ALUMINUM_SHEET',
    name: 'Aluminum Sheet 1mm',
    brand: 'Generic',
    supplier: 'MetalSupply Co',
    thickness: 1,
    width: 1250,
    length: 2500,
    weight: 3.4,
    weatherResistant: false,
    applications: ['Channel letters', 'Sign boxes', 'Trim'],
    availableColors: [sampleColors[0]],
    supportsCustomColor: true,
    unitPrice: 45.00,
    currency: 'EUR',
    pricePerUnit: 'sheet',
    minStockLevel: 15,
    reorderPoint: 20,
    leadTimeDays: 2,
    notes: 'Requires powder coating or painting',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'mat-005',
    category: 'VINYL',
    subtype: 'CAST_VINYL',
    name: 'Avery Dennison MPI 1105 EA',
    brand: 'Avery Dennison',
    supplier: 'GraphicsSupply',
    width: 1370,
    length: 50000,
    weatherResistant: true,
    uvRating: '7-10 years outdoor',
    applications: ['Vehicle graphics', 'Wall graphics', 'Decals'],
    availableColors: [sampleColors[0], sampleColors[1], sampleColors[2], sampleColors[3]],
    supportsCustomColor: false,
    unitPrice: 8.50,
    currency: 'EUR',
    pricePerUnit: 'linear_meter',
    minStockLevel: 100,
    reorderPoint: 150,
    leadTimeDays: 3,
    notes: 'Premium cast vinyl with repositionable adhesive',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'mat-006',
    category: 'PLASTIC',
    subtype: 'PVC_FOAM',
    name: 'Forex Classic 5mm White',
    brand: 'Forex',
    supplier: 'PlasticWorld',
    thickness: 5,
    width: 2050,
    length: 3050,
    weatherResistant: false,
    applications: ['Indoor displays', 'POS', 'Exhibition graphics'],
    availableColors: [sampleColors[0]],
    supportsCustomColor: false,
    unitPrice: 32.00,
    currency: 'EUR',
    pricePerUnit: 'sheet',
    minStockLevel: 20,
    reorderPoint: 30,
    leadTimeDays: 2,
    notes: 'Lightweight, easy to cut and print',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'mat-007',
    category: 'FINISHING',
    subtype: 'LIQUID_PAINT',
    name: 'RAL Color Paint - Custom Mix',
    brand: 'Industrial Paint Co',
    supplier: 'PaintSupply',
    weatherResistant: true,
    uvRating: 'Excellent',
    applications: ['Metal finishing', 'Sign boxes', 'Trim'],
    availableColors: sampleColors,
    supportsCustomColor: true,
    unitPrice: 45.00,
    currency: 'EUR',
    pricePerUnit: 'kg',
    minStockLevel: 5,
    reorderPoint: 10,
    leadTimeDays: 5,
    notes: 'Custom RAL colors available, 2-component system',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'mat-008',
    category: 'HARDWARE',
    subtype: 'STANDOFFS',
    name: 'Stainless Steel Standoffs 19mm',
    brand: 'Generic',
    supplier: 'HardwareStore',
    weatherResistant: true,
    applications: ['Sign mounting', 'Panel fixing'],
    unitPrice: 2.50,
    currency: 'EUR',
    pricePerUnit: 'piece',
    minStockLevel: 100,
    reorderPoint: 150,
    leadTimeDays: 7,
    notes: 'Polished finish, includes screws',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z'
  }
];

/**
 * Seed the inventory with sample materials
 */
export function seedSampleMaterials(inventory: any): void {
  sampleMaterials.forEach(material => {
    inventory.addMaterial(material);
    
    // Add some initial stock for each material
    const initialStock = {
      id: crypto.randomUUID(),
      materialId: material.id,
      type: 'RECEIPT' as const,
      quantity: material.minStockLevel ? material.minStockLevel * 2 : 10,
      performedBy: 'system',
      timestamp: new Date().toISOString(),
      notes: 'Initial stock'
    };
    
    inventory.recordMovement(initialStock);
  });
}
