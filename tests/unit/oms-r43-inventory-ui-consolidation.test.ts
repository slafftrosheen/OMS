import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {materialFromItemDto,materialToItemDto} from '../../src/lib/inventory/api-contract';
import {parseInventoryCsv} from '../../src/lib/inventory/csv-import';

const read=(p:string)=>readFileSync(p,'utf8');

describe('OMS-R43 — single inventory UI contract and audit-only stock mutation',()=>{
 it('normalizes the existing legacy item DTO to canonical material fields',()=>{
   const result=materialFromItemDto({
     id:'m1',sku:'AX-001',name:'Aluminium sheet',group:'Sheets',
     subgroup:'3mm',unit:'sheet',stock:23,min:4,colorCode:'RAL 9010',
     updatedAt:'2026-10-17T06:00:00Z'
   });
   expect(result).toMatchObject({
     id:'m1',sku:'AX-001',name_en:'Aluminium sheet',
     item_group:'Sheets',subgroup:'3mm',stock:23,min_stock:4,
     color_code:'RAL 9010',updated_at:'2026-10-17T06:00:00Z'
   });
   const refreshed=materialFromItemDto({id:'m1',name:'New name',stock:22},
     {...result,supplier:'Steel Supplier',min_stock:4});
   expect(refreshed.name_en).toBe('New name');
   expect(refreshed.supplier).toBe('Steel Supplier');
   expect(refreshed.stock).toBe(22);
 });
 it('never sends stock as metadata change, and creates at exactly zero',()=>{
   const source={
     name_en:'Panel',item_group:'Panels',min_stock:10,stock:400,
     supplier:'Vendor',color_code:'RAL 9016'
   };
   const edit=materialToItemDto(source);
   expect(edit).toMatchObject({name:'Panel',group:'Panels',min:10,
     supplier:'Vendor',colorCode:'RAL 9016'});
   expect(edit).not.toHaveProperty('stock');
   expect(materialToItemDto(source,{create:true}).stock).toBe(0);
   expect(edit).not.toHaveProperty('material_id');
 });
 it('refuses silent nonzero opening stock in legacy 9-column CSV',()=>{
   const bad=parseInventoryCsv([
     'section,group,subgroup,sku,name,unit,stock,min,location',
     'materials,Sheets,3mm,AX-01,Aluminium,sheet,12,2,Rack-A',
     'materials,Sheets,3mm,AX-02,Aluminium sheet,sheet,0,2,Rack-B'
   ].join('\n'));
   expect(bad.errors).toHaveLength(1);
   expect(bad.errors[0]).toContain('opening stock must be 0');
   expect(bad.rows).toHaveLength(1);
   expect(bad.rows[0].metadata).toMatchObject({stock:0,sku:'AX-02',
     min_stock:2,name_en:'Aluminium sheet'});
 });
 it('parses quoted comma-bearing names and rejects repeated SKUs and invalid numbers',()=>{
   const parsed=parseInventoryCsv([
     'materials,Metal,Aluminum,AX-02,"Aluminium, brushed",sheet,0,3,Shelf 1',
     'materials,Metal,Aluminum,ax-02,Duplicate,sheet,0,3,Shelf 1',
     'materials,Metal,Aluminum,AX-03,Invalid,sheet,0,2.5,Shelf 2',
     'materials,Metal,Aluminum,AX-04,Valid,sheet,0,0,Shelf 2'
   ].join('\n'));
   expect(parsed.rows).toHaveLength(2);
   expect(parsed.rows[0].metadata.name_en).toBe('Aluminium, brushed');
   expect(parsed.errors).toHaveLength(2);
   expect(parsed.errors.join(' ')).toContain('duplicate SKU');
   expect(parsed.errors.join(' ')).toContain('minimum stock');
 });
 it('does not keep the old first-page-only catalog or mapped fields in editing store',()=>{
   const store=read('src/lib/inventory/store.ts');
   expect(store).toContain('materialFromItemDto');
   expect(store).toContain('materialToItemDto');
   expect(store).toContain('payload.pagination.hasNext');
   expect(store).toContain('page<=100');
   expect(store).toContain('if(hasNext)throw new Error');
   expect(store).toContain('loadMaterialById');
   expect(store).toContain("cache:'no-store'");
   expect(store).toContain('catalogError.set(');
   expect(store).toContain('pendingManualMovements.get(materialId)');
   expect(store).toContain('pending?.requestId');
   expect(store).toContain('pendingManualMovements.delete(materialId)');
   expect(store).toContain("material.barcode?.trim().toLowerCase()===needle");
   expect(store).toContain('found.length===1?found[0]:null');
   expect(store).toContain('body: JSON.stringify(materialToItemDto(patch))');
   expect(store).toContain('body: JSON.stringify(materialToItemDto(input,{create:true}))');
 });
 it('replaces barcode auto-increment with explicit lookup and audited material detail',()=>{
   const scan=read('src/lib/inventory/ScanBarcode.svelte');
   expect(scan).toContain('match=findMaterialBySku(detected)');
   expect(scan).toContain('inventoryConsolidation.barcodeLookupOnly');
   expect(scan).toContain('/inventory/');
   expect(scan).not.toContain('updateMaterial(');
   expect(scan).not.toContain('recordMovement(');
   const detail=read('src/routes/inventory/[id]/+page.svelte');
   expect(detail).toContain('loadMaterialById(id, { signal: request.signal');
   expect(detail).toContain('request.accepts(detailScope)');
   expect(detail).toContain('await move(');
   expect(detail).toContain('Number.isSafeInteger(adjustAmount)');
   expect(detail).toContain('canManage');
   expect(detail).toContain('inventoryConsolidation.movementUnconfirmed');
 });
 it('removes stock editing from material-creation and metadata-only forms',()=>{
   const modal=read('src/lib/inventory/ItemModal.svelte');
   const fresh=read('src/routes/inventory/new/+page.svelte');
   const upload=read('src/lib/inventory/ImportCSV.svelte');
   const index=read('src/routes/inventory/+page.svelte');
   expect(modal).not.toContain('bind:value={data.stock}');
   expect(modal).toContain('stock:_stock');
   expect(modal).toContain('if(!result)');
   expect(fresh).not.toContain('bind:value={material.stock}');
   expect(fresh).toContain('if(!created)');
   expect(upload).toContain('parseInventoryCsv');
   expect(upload).toContain('createMaterial({...entry.metadata,stock:0})');
   expect(upload).not.toContain('createItem(');
   expect(index).toContain('{#if canManage}');
   expect(index).toContain('const unsub=materials.subscribe(');
   expect(index).toContain('catalogError.subscribe(');
   const catalog=read('src/routes/inventory/catalog/+page.svelte');
   expect(catalog).toContain('/inventory/new');
   expect(catalog).toContain('catalogFailure');
   expect(catalog).not.toContain('/* Open add material modal */');
 });
 it('preserves movement audit visibility and presents failure as unknown, never empty',()=>{
   const page=read('src/routes/inventory/movements/+page.svelte');
   expect(page).toContain('loadError');
   expect(page).toContain('if(!response.ok)throw Error');
   expect(page).toContain("cache:'no-store'");
   expect(page).toContain('if(version===sequence)');
   expect(page).toContain('encodeURIComponent(m.refPO)');
 });
 it('maintains EN/RU/LV inventory action translations',()=>{
   const keys=['auditedStockOnly','newMaterialZero','barcodeLookupOnly',
     'csvWarning','csvCheck','csvCreate','csvImported','csvSaveFailed',
     'metadataFailed','movementUnconfirmed','historyUnavailable',
     'detailLoading','detailUnavailable','catalogUnavailable','barcodeDetected'];
   for(const lang of ['en','ru','lv']){
     const catalog=JSON.parse(read(`src/locales/${lang}.json`)).inventoryConsolidation;
     for(const key of keys)expect(typeof catalog[key]).toBe('string');
     expect(catalog.csvImported).toContain('{saved}');
     expect(catalog.csvPreview).toContain('{count}');
   }
 });
});
