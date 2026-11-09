import {describe,it,expect} from 'vitest';
import Ajv from 'ajv';
import {PRODUCTION_INTAKE_JSON_SCHEMA,productionIntakeSchema} from '../../src/lib/order/production-intake';

describe('provider intake schema and application validation',()=>{
  it('prevents oversized missing-question lists and invalid facts from reaching the review validator',()=>{
    const validate=new Ajv().compile(PRODUCTION_INTAKE_JSON_SCHEMA);
    const empty={proposals:[],profileSuggestions:[],production:[],missing:[]};
    const invalid=[
      {...empty,missing:Array.from({length:13},(_,i)=>`Question ${i+1}`)},
      {...empty,missing:['x'.repeat(251)]},
      {...empty,production:[{target:'width',value:'1200 mm',evidence:'',page:1,part:null,confidence:'high'}]},
      {...empty,profileSuggestions:[{name:'Sign',quantity:0,details:''}]}
    ];
    for(const response of invalid){
      expect(productionIntakeSchema.safeParse(response).success).toBe(false);
      expect(validate(response)).toBe(false);
    }
    expect(validate({...empty,missing:['Confirm the delivery date']})).toBe(true);
  });
});
