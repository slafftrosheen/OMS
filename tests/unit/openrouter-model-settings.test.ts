import {describe,it,expect} from 'vitest';
import {parseModelSelection, normalizeModelCatalog, validateModelSelection} from '../../src/lib/settings/openrouter-models';
import {readOpenRouterModels} from '../../src/lib/server/ai/provider-models';

const catalog=normalizeModelCatalog({data:[
  {id:'router/text',name:'Text',architecture:{input_modalities:['text']},supported_parameters:['tools'],pricing:{prompt:'0',completion:'0'}},
  {id:'vision/compatible:free',name:'Vision',architecture:{input_modalities:['text','image']},supported_parameters:['response_format','structured_outputs'],pricing:{prompt:'0',completion:'0'}},
  {id:'vision/images-only',name:'Images only',architecture:{input_modalities:['text','image']},supported_parameters:['response_format'],pricing:{prompt:'0',completion:'0'}}
]});
describe('OpenRouter model selection',()=>{
  it('reads the latest persisted choices for each request without retaining the earlier model',async()=>{
    let row={text_model:'saved/text',vision_model:'saved/vision'};
    const query:any={select:()=>query,eq:()=>query,single:async()=>({data:row,error:null})};
    const db:any={from:()=>query};
    expect(await readOpenRouterModels(db)).toEqual({textModel:'saved/text',visionModel:'saved/vision'});
    row={text_model:'saved/text',vision_model:'changed/vision'};
    expect(await readOpenRouterModels(db)).toEqual({textModel:'saved/text',visionModel:'changed/vision'});
  });
  it('refuses inference configuration when model settings cannot be read',async()=>{
    const query:any={select:()=>query,eq:()=>query,single:async()=>({data:null,error:{code:'missing_column'}})};
    let failed=false;try{await readOpenRouterModels({from:()=>query} as any);}catch{failed=true;}
    expect(failed).toBe(true);
  });
  it('rejects a vision model that accepts images but cannot enforce the intake schema',()=>{
    let message='';
    try {validateModelSelection({textModel:'router/text',visionModel:'vision/images-only'},catalog);} catch(err){message=(err as Error).message;}
    expect(message).toContain('structured');
    expect(validateModelSelection({textModel:'router/text',visionModel:'vision/compatible:free'},catalog)).toEqual({textModel:'router/text',visionModel:'vision/compatible:free'});
  });
  it('rejects unknown IDs, injected fields and invalid model addresses before persistence',()=>{
    for(const value of [{textModel:'router/text',visionModel:'https://evil.test/model'},
      {textModel:'router/text',visionModel:'vision/compatible:free',apiKey:'secret'},
      {textModel:'',visionModel:'vision/compatible:free'},null]) {
      let failed=false;try{parseModelSelection(value);}catch{failed=true;}expect(failed).toBe(true);
    }
    let failed=false;try{validateModelSelection({textModel:'router/text',visionModel:'missing/model'},catalog);}catch{failed=true;}
    expect(failed).toBe(true);
  });
  it('derives capability and cost labels from provider metadata',()=>{
    expect(catalog.find(m=>m.id==='vision/compatible:free')).toEqual({id:'vision/compatible:free',name:'Vision',image:true,text:true,structured:true,tools:false,free:true});
    expect(catalog.find(m=>m.id==='vision/images-only')?.structured).toBe(false);
  });
});
