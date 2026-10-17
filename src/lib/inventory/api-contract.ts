import type {Material} from './types';

/** Adapter for the older /api/inventory/items camelCase DTO.
 * The Svelte store and every editing form use canonical materials columns.
 * Never interpret an API's "min" or "name" as a different stock source.
 */
type InventoryItemDto=Record<string,unknown>;
const str=(x:unknown,fallback='')=>typeof x==='string'?x:fallback;
const integer=(x:unknown,fallback=0)=>typeof x==='number'&&Number.isFinite(x)?x:fallback;
export function materialFromItemDto(dto:InventoryItemDto):Material {
  return {
    ...dto,
    id:str(dto.id),
    sku:str(dto.sku),
    code:str(dto.code,str(dto.sku)),
    category:str(dto.category,'HARDWARE') as Material['category'],
    name_en:str(dto.name_en,str(dto.name)),
    section:str(dto.section,'materials') as Material['section'],
    item_group:str(dto.item_group,str(dto.group)),
    subgroup:str(dto.subgroup),
    unit:str(dto.unit,'PCS') as Material['unit'],
    stock:integer(dto.stock),
    min_stock:integer(dto.min_stock,integer(dto.min)),
    max_stock:integer(dto.max_stock,integer(dto.max)),
    thickness_mm:integer(dto.thickness_mm,integer(dto.thicknessMM)),
    location:str(dto.location),
    vendor:str(dto.vendor),
    supplier:str(dto.supplier),
    color_code:str(dto.color_code,str(dto.colorCode)),
    hex_color:str(dto.hex_color,str(dto.hexColor)),
    barcode:str(dto.barcode),
    note:str(dto.note),
    price:integer(dto.price),
    leftover_data:(dto.leftover_data??dto.leftover??null) as Material['leftover_data'],
    metadata:(dto.metadata??{}) as Material['metadata'],
    created_at:str(dto.created_at,str(dto.updatedAt)),
    updated_at:str(dto.updated_at,str(dto.updatedAt))
  } as Material;
}
/** Only editable metadata is accepted. Stock changes belong to the audited
 * movement RPC, not an inventory item PATCH/PUT/create payload.
 */
export function materialToItemDto(
  input:Partial<Material>,{create=false}:{create?:boolean}={}
):Record<string,unknown> {
  const result:Record<string,unknown>={};
  const fields:Record<string,string>={
    sku:'sku',code:'code',name_en:'name',category:'category',
    section:'section',item_group:'group',subgroup:'subgroup',unit:'unit',
    min_stock:'min',max_stock:'max_stock',thickness_mm:'thicknessMM',
    location:'location',vendor:'vendor',supplier:'supplier',
    color_code:'colorCode',hex_color:'hexColor',barcode:'barcode',
    price:'price',note:'note',leftover_data:'leftover',metadata:'metadata'
  };
  for(const [source,target] of Object.entries(fields)){
    const value=(input as Record<string,unknown>)[source];
    if(value!==undefined)result[target]=value;
  }
  if(create)result.stock=0;
  return result;
}
