import {describe,it,expect} from 'vitest';
import {createProviderModelHandlers} from '../../src/lib/server/ai/provider-model-handler';
import {normalizeModelCatalog} from '../../src/lib/settings/openrouter-models';

const choices=normalizeModelCatalog({data:[
  {id:'fixture/text',architecture:{input_modalities:['text']},supported_parameters:['tools']},
  {id:'fixture/vision',architecture:{input_modalities:['image','text']},supported_parameters:['response_format','structured_outputs']},
  {id:'fixture/images-only',architecture:{input_modalities:['image','text']},supported_parameters:['response_format']}
]});
function fixture(role='RD',active=true) {
  const row:any={text_model:'old/text',vision_model:'old/vision'};
  let writes=0;
  const db:any={from:(_table:string)=>{
    const query:any={select:()=>query,eq:()=>query,update:(change:any)=>{writes++;Object.assign(row,change);return query;},
      single:async()=>({data:row,error:null}),insert:async()=>({error:null})};
    return query;
  }};
  const handlers=createProviderModelHandlers({database:()=>db,catalog:async()=>choices,
    readModels:async()=>({textModel:row.text_model,visionModel:row.vision_model})});
  const event=(body:unknown={textModel:'fixture/text',visionModel:'fixture/vision'},user:unknown={id:'rd-account',role})=>({
    locals:{user,supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role,is_active:active},error:null})})})})}},
    request:new Request('http://localhost/api/settings/openrouter/models',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
  } as any);
  return {handlers,event,row,writes:()=>writes};
}
describe('R&D model settings API',()=>{
  it('denies anonymous, ordinary, inactive and stale-role accounts before a write',async()=>{
    for(const setup of [fixture('Operator'),fixture('RD',false)])
      expect((await setup.handlers.PATCH(setup.event())).status).toBe(403);
    const setup=fixture();
    expect((await setup.handlers.PATCH(setup.event({},null))).status).toBe(401);
    expect((await setup.handlers.PATCH(setup.event({},{id:'account',role:'Boss'}))).status).toBe(403);
    expect(setup.writes()).toBe(0);
  });
  it('persists validated selections and returns the saved choices on the next read',async()=>{
    const setup=fixture();
    const saved=await setup.handlers.PATCH(setup.event());
    expect(saved.status).toBe(200);
    expect(setup.row.text_model).toBe('fixture/text');
    expect(setup.row.vision_model).toBe('fixture/vision');
    const payload=await (await setup.handlers.GET(setup.event())).json();
    expect(payload.textModel).toBe('fixture/text');
    expect(payload.visionModel).toBe('fixture/vision');
    expect(payload.choices).toHaveLength(3);
    expect(payload.apiKey).toBe(undefined);
  });
  it('leaves settings untouched when the selected vision model cannot satisfy OCR output',async()=>{
    const setup=fixture();
    const response=await setup.handlers.PATCH(setup.event({textModel:'fixture/text',visionModel:'fixture/images-only'}));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('structured');
    expect(setup.writes()).toBe(0);
    expect(setup.row.vision_model).toBe('old/vision');
  });
});
