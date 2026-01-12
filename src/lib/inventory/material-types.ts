export type MaterialCategory = 
  | 'SHEET_METAL'
  | 'COMPOSITE'
  | 'PLASTIC'
  | 'VINYL'
  | 'FINISHING'
  | 'HARDWARE'
  | 'ELECTRONICS'
  | 'LED'
  | 'PSU'
  | 'FASTENERS'
  | '3D_PRINTING'
  | 'ADHESIVES';

export type MaterialSubtype = 
  // Sheet metals
  | 'ALUMINUM_SHEET'
  | 'STAINLESS_STEEL'
  | 'GALVANIZED_STEEL'
  // Composites
  | 'ACM_PANEL'
  | 'DIBOND'
  | 'ALUPANEL'
  // Plastics
  | 'PVC_FOAM'
  | 'ACRYLIC'
  | 'POLYCARBONATE'
  | 'CORRUGATED_PLASTIC'
  | 'PETG'
  | 'ABS'
  // Vinyls
  | 'CAST_VINYL'
  | 'CALENDERED_VINYL'
  | 'REFLECTIVE_VINYL'
  | 'PRINTABLE_VINYL'
  | 'ORACAL_8500'
  | 'ORACAL_651'
  | 'ORACAL_751'
  | 'ORACAL_970'
  // Finishing
  | 'POWDER_COATING'
  | 'LIQUID_PAINT'
  | 'SPRAY_PAINT'
  | 'LAMINATE'
  | 'PRIMER'
  // Hardware
  | 'MOUNTING_BRACKETS'
  | 'RIVETS'
  | 'STANDOFFS'
  | 'SCREWS'
  | 'BOLTS'
  | 'NUTS'
  | 'WASHERS'
  | 'ANCHORS'
  | 'CABLE_TIES'
  | 'CLAMPS'
  // Electronics
  | 'LED_MODULE'
  | 'LED_STRIP'
  | 'LED_STRIP_ADDRESSABLE'
  | 'LED_STRIP_CCT'
  | 'LED_STRIP_RGB'
  | 'LED_STRIP_RGBW'
  | 'LED_NEON'
  | 'POWER_SUPPLY'
  | 'LED_CONTROLLER'
  | 'LED_DRIVER'
  | 'WIRING'
  | 'CONNECTORS'
  // 3D Printing
  | 'RESIN_SLA'
  | 'RESIN_LCD'
  | 'FILAMENT_PLA'
  | 'FILAMENT_ABS'
  | 'FILAMENT_PETG'
  | 'FILAMENT_TPU'
  | 'FILAMENT_ASA'
  | 'FILAMENT_NYLON'
  // Adhesives
  | 'DOUBLE_SIDED_TAPE'
  | 'TRANSFER_TAPE'
  | 'STRUCTURAL_ADHESIVE'
  | 'SILICONE'
  | 'EPOXY';

export interface MaterialSpec {
  id: string;
  sku: string; // Stock Keeping Unit - unique identifier
  category: MaterialCategory;
  subtype: MaterialSubtype;
  name: string;
  brand?: string;
  supplier?: string;
  
  // Physical properties
  thickness?: number; // mm
  width?: number; // mm
  length?: number; // mm
  weight?: number; // kg per unit
  
  // Technical specs
  weatherResistant?: boolean;
  uvRating?: string;
  temperatureRange?: string;
  applications?: string[];
  
  // Color info
  hexColor?: string; // Primary color hex value for UI display
  availableColors?: ColorSpec[];
  supportsCustomColor?: boolean;
  
  // Electronics specific
  wattage?: number; // W
  voltage?: number; // V
  amperage?: number; // A
  colorTemperature?: number; // Kelvin
  lumens?: number;
  ledCount?: number; // LEDs per meter/unit
  ipRating?: string; // e.g., IP20, IP65, IP68
  
  // Pricing
  unitPrice?: number;
  currency?: string;
  pricePerUnit?: 'sheet' | 'sqm' | 'linear_meter' | 'kg' | 'piece' | 'roll' | 'meter' | 'liter' | 'bottle';
  
  // Stock management
  currentStock?: number;
  minStockLevel?: number;
  reorderPoint?: number;
  leadTimeDays?: number;
  
  // Metadata
  notes?: string;
  datasheet?: string; // URL
  imageUrl?: string;
  barcode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ColorSpec {
  id: string;
  name: string;
  ralCode?: string; // e.g., "RAL 9016"
  pantoneCode?: string; // e.g., "Pantone 185 C"
  hexValue?: string; // e.g., "#FF5733"
  cmykValues?: { c: number; m: number; y: number; k: number };
  isCustom?: boolean;
  customFormulation?: string;
  finishType?: 'MATTE' | 'GLOSS' | 'SATIN' | 'TEXTURED';
  swatchUrl?: string;
}
