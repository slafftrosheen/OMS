import type { User } from '../../src/lib/auth/types';
import type { OrderSheetSnapshot } from '../../src/lib/order/order-sheet';

export const orderSheetIds = {
  first: 'a1111111-1111-4111-8111-111111111111',
  second: 'b2222222-2222-4222-8222-222222222222'
};
export const orderSheetUsers: Record<'manager' | 'worker' | 'second', User> = {
  manager: { id: 'c3333333-3333-4333-8333-333333333333', username: 'production', displayName: 'Production Manager', role: 'HeadOfProduction', stations: [] },
  worker: { id: 'd4444444-4444-4444-8444-444444444444', username: 'elina', displayName: 'Elina', role: 'Operator', stations: [{ stationId: 'cnc', isHead: false }] },
  second: { id: 'e5555555-5555-4555-8555-555555555555', username: 'janis', displayName: 'Janis', role: 'Operator', stations: [{ stationId: 'assembly', isHead: false }] }
};
export const orderSheetLongNote = 'Use the approved mounting template. Check every hole and cable outlet against the signed drawing before drilling. Keep the front protective film in place until the final inspection. Record any mismatch in the order chat before continuing.';
export const orderSheetMaterials = [
  { id: 1, category: 'ACRYLIC_GS', code: 'PLEXIGLAS_GS_1C33', name_en: 'PLEXIGLAS GS Yellow 1C33', name_lv: 'PLEXIGLAS GS dzeltens 1C33', name_ru: 'PLEXIGLAS GS жёлтый 1C33', thickness_options: [3, 4, 5, 6, 8], metadata: { brand: 'PLEXIGLAS', series: 'GS', colorCode: '1C33', hex: '#FFD700' } },
  { id: 2, category: 'ALU_SHEET', code: 'ALU_SHEET_1500X3000', name_en: 'Aluminium sheet 1500 × 3000 mm', thickness_options: [0.5, 1, 1.5, 2, 3, 5, 8, 10, 15], metadata: { type: 'sheet', product_form: 'sheet', hex: '#c4c9cc' } },
  { id: 3, category: 'VINYL_ORACAL', code: '005S', name_en: 'ORACAL 8500 Middle Blue', thickness_options: [0.1], metadata: { brand: 'ORACAL', series: '8500', colorCode: '005', hex: '#0539A2' } },
  { id: 4, category: 'PAINT_RAL', code: 'RAL_3024', name_en: 'RAL 3024 Luminous red', thickness_options: [], metadata: { brand: 'RAL', ralCode: '3024', hex: '#FF2D21' } },
  { id: 5, category: 'FDM_ASA', code: 'FIBERLOGY_ASA_BLACK', name_en: 'Fiberlogy ASA black', thickness_options: [], metadata: { brand: 'Fiberlogy', material: 'ASA', color: 'black' } },
  { id: 6, category: 'RESIN_ANYCUBIC', code: 'ANYCUBIC_TOUGH_WHITE', name_en: 'Anycubic Tough Resin White', thickness_options: [], metadata: { brand: 'Anycubic', material: 'Photopolymer resin', product_family: 'Tough', color: 'white' } }
];

export function orderSheetSnapshot(id = orderSheetIds.first, status = 'CONFIRMED'): OrderSheetSnapshot {
  const second = id === orderSheetIds.second;
  return {
    id, status, createdBy: orderSheetUsers.manager.id, updatedAt: '2026-10-31T10:00:00Z',
    poNumber: second ? 'RF-1002' : 'RF-1001', internalRef: 'D-1001', title: second ? 'Second production sign' : 'Yellow channel letters',
    clientName: 'RF Test Client', deadline: '2026-11-15', loadingDate: '2026-11-14', priority: 'NORMAL',
    notes: 'Use the signed drawing for all final dimensions.', isRd: false,
    deliveryAddress: 'Example Street 12\nRiga, Latvia', deliveryContact: 'Test Contact', deliveryPhone: '+371 20000000', deliveryEmail: 'contact@example.test',
    profiles: [{ id: `${id}-profile`, dbId: `${id}-profile`, quantity: second ? 1 : 2, notes: 'Check the profile sample before assembly.',
      configuration: {
        profileName: second ? 'Second resin profile' : 'Main yellow profile', signType: 'EXTERIOR',
        CNC_FREZER: second ? {
          face: 'ANYCUBIC_TOUGH_WHITE', faceCategory: 'RESIN_ANYCUBIC',
          faceMaterials: [{ id: 'face-one', value: 'ANYCUBIC_TOUGH_WHITE', category: 'RESIN_ANYCUBIC', process: '3D_PRINT' }],
          back: 'ALU_SHEET_1500X3000', backThickness: '1.5mm', notes: orderSheetLongNote
        } : {
          face: 'PLEXIGLAS_GS_1C33', faceThickness: '3mm',
          faceMaterials: [{ id: 'face-one', value: 'PLEXIGLAS_GS_1C33', category: 'ACRYLIC_GS', thickness: '3mm' }],
          back: 'FIBERLOGY_ASA_BLACK', backCategory: 'FDM_ASA', backProcess: '3D_PRINT', notes: orderSheetLongNote
        },
        BENDER: { sides: 'ALU_SHEET_1500X3000', sidesThickness: '1.5mm', depth: 100 },
        FRONT: { face: true, facePrint: true, faceFilm: '005S', faceFilmShort: '005', faceCustom: 'Print the approved lightbox artwork.' },
        PAINTING: { face: true, faceColor: { system: 'RAL', code: '3024', hex: '#FF2D21' } },
        ASSEMBLING: { notes: 'Use the rear cable outlet.' }
      }
    }]
  };
}

export function orderSheetBaseOrder(snapshot: OrderSheetSnapshot) {
  return {
    id: snapshot.id, status: snapshot.status, title: snapshot.title, po_number: snapshot.poNumber,
    client: snapshot.clientName, due_date: snapshot.deadline, loading_date: snapshot.loadingDate,
    priority: snapshot.priority, created_by: snapshot.createdBy, created_at: '2026-10-29T09:00:00Z',
    updated_at: snapshot.updatedAt, description: snapshot.notes, price: 2500, rework_count: 0,
    stages: [{ id: `${snapshot.id}-cnc`, draft_order_id: snapshot.id, station: 'cnc', state: 'IN_PROGRESS',
      updated_at: snapshot.updatedAt, notes: 'Use approved drill pattern.' }],
    activity_log: [], rework_cycles: [], materials: [], assignees: [], revisions: []
  };
}
