// src/lib/profiles/builder/index.ts
import { STANDARD_THICKNESSES, MATERIAL_TYPES, PROFILE_CODES } from '../constants';
import type { ProfileTemplate, FieldType } from '../types';

export interface ProfileConfig {
  code: string;
  width: number;
  height: number;
  depth?: number;
  materials: {
    face?: string;
    back?: string;
    return?: string;
  };
  colors: {
    face?: string;
    return?: string;
  };
  thicknesses: {
    face?: number;
    back?: number;
  };
  illumination?: boolean;
}

export class ProfileBuilder {
  private config: ProfileConfig;

  constructor(code: string = PROFILE_CODES.P7ST) {
    this.config = {
      code,
      width: 0,
      height: 0,
      materials: {},
      colors: {},
      thicknesses: {}
    };
  }

  setDimensions(width: number, height: number, depth?: number): ProfileBuilder {
    this.config.width = width;
    this.config.height = height;
    if (depth) this.config.depth = depth;
    return this;
  }

  setFace(material: string, thickness: number, color?: string): ProfileBuilder {
    this.config.materials.face = material;
    this.config.thicknesses.face = thickness;
    if (color) this.config.colors.face = color;
    return this;
  }

  setBack(material: string, thickness: number): ProfileBuilder {
    this.config.materials.back = material;
    this.config.thicknesses.back = thickness;
    return this;
  }

  setReturn(material: string, color?: string): ProfileBuilder {
    this.config.materials.return = material;
    if (color) this.config.colors.return = color;
    return this;
  }

  setIllumination(hasLed: boolean): ProfileBuilder {
    this.config.illumination = hasLed;
    return this;
  }

  validate(): string[] {
    const errors: string[] = [];
    if (this.config.width <= 0 || this.config.height <= 0) {
      errors.push('Dimensions must be positive');
    }
    if (!this.config.materials.face) {
      errors.push('Face material is required');
    }
    return errors;
  }

  build(): ProfileConfig {
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Invalid profile configuration: ${errors.join(', ')}`);
    }
    return this.config;
  }

  /**
   * Estimate cost based on dimensions and material complexity (Mock)
   */
  estimateCost(): number {
    const area = (this.config.width * this.config.height) / 1000000; // m2
    const perimeter = (this.config.width + this.config.height) * 2 / 1000; // m
    
    let basePrice = 50; // Base setup
    
    // Material costs (mock)
    if (this.config.materials.face === MATERIAL_TYPES.ACRYLIC) basePrice += area * 80;
    if (this.config.materials.face === MATERIAL_TYPES.DIBOND) basePrice += area * 45;
    
    // Perimeter costs (e.g., bending/welding)
    if (this.config.code === PROFILE_CODES.P7ST) basePrice += perimeter * 25;
    
    // Illumination
    if (this.config.illumination) basePrice += (area * 50) + (perimeter * 20);

    return Math.round(basePrice * 100) / 100;
  }
}

export function createProfile(code: string): ProfileBuilder {
  return new ProfileBuilder(code);
}
