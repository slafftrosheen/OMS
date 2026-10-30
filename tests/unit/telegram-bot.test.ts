import { describe, it, expect } from 'vitest';
import { DEFAULT_TELEGRAM_OPTIONS } from '../../src/lib/notifications/telegram-options';
import { readTelegramCommand, readTelegramUpdateIdentity, type TelegramConfig } from '../../src/lib/server/notifications/telegram';
import { answerTelegramQuestion, dispatchTelegramBotReplies, formatTelegramBotReply, telegramCommandMenu } from '../../src/lib/server/notifications/telegram-bot';
import { dispatchTelegramDeliveries } from '../../src/lib/server/notifications/telegram-service';

const config: TelegramConfig = { botToken:'123456:abcdefghijklmnopqrstuvwxyz',botUsername:'OMS_notify_bot',webhookSecret:'s'.repeat(32),deliverySecret:'d'.repeat(32),appUrl:'https://oms.example.test',options:{...DEFAULT_TELEGRAM_OPTIONS,enabled:true,aiEnabled:true} };
const command=(text:string)=>({update_id:100,message:{date:1792660000,text,chat:{id:1234,type:'private'},from:{id:1234,is_bot:false}}});

describe('Bidirectional Telegram command parsing',()=>{
  it('supports bounded linked-account commands and preserves question text',()=>{
    expect(readTelegramCommand(command('/orders Acme signs'),config.botUsername)).toEqual({kind:'command',command:'orders',argument:'Acme signs',chatId:'1234',telegramUserId:'1234'});
    expect((readTelegramCommand(command('/ask What is due today?'),config.botUsername) as any).argument).toBe('What is due today?');
    expect((readTelegramCommand(command('/start'),config.botUsername) as any).command).toBe('help');
    expect(readTelegramCommand(command('/ask '+ 'x'.repeat(1001)),config.botUsername)).toBe(null);
    expect(readTelegramCommand(command('/order'),config.botUsername)).toBe(null);
    expect(readTelegramCommand(command('/pause someone-else'),config.botUsername)).toBe(null);
    expect(readTelegramCommand(command('/orders@other_bot'),config.botUsername)).toBe(null);
  });
  it('accepts only private callbacks belonging to their sender with an allowlisted action',()=>{
    const update:any={update_id:101,callback_query:{id:'callback1',data:'oms:read:12345678-0000-0000-0000-000000000001',from:{id:1234},message:{date:1,chat:{id:1234,type:'private'}}}};
    expect((readTelegramCommand(update,config.botUsername) as any).command).toBe('read');
    expect(readTelegramUpdateIdentity(update)?.updateId).toBe(101);
    expect(new Date(readTelegramUpdateIdentity(update)!.messageAt).getTime()>Date.now()-1000).toBe(true);
    update.callback_query.from.id=999;
    expect(readTelegramCommand(update,config.botUsername)).toBe(null);
    update.callback_query.from.id=1234;update.callback_query.message.chat.type='group';
    expect(readTelegramCommand(update,config.botUsername)).toBe(null);
    update.callback_query.message.chat.type='private';update.callback_query.data='oms:delete:all';
    expect(readTelegramCommand(update,config.botUsername)).toBe(null);
  });
  it('excludes disabled commands and AI from the synchronized private menu',()=>{
    const menu=telegramCommandMenu({...config,options:{...config.options!,aiEnabled:false,commands:['help','ask','notifications']}});
    expect(menu.map(row=>row.command)).toEqual(['help','notifications','stop']);
    expect(telegramCommandMenu({...config,options:{...config.options!,commandsEnabled:false}}).map(row=>row.command)).toEqual(['stop']);
  });
});

describe('Telegram replies and read-only OpenRouter questions',()=>{
  it('formats account-language notifications with owner action buttons',()=>{
    const id='12345678-0000-0000-0000-000000000001';
    const reply=formatTelegramBotReply({kind:'notifications',locale:'ru',notifications:[{id,title:'Заказ готов',message:'Доступен к погрузке'}]},config);
    expect(reply.text.includes('Непрочитанные уведомления')).toBe(true);
    expect(reply.keyboard[0][0].callback_data).toBe('oms:read:'+id);
  });
  it('keeps output within Telegram text limits and masks unavailable records',()=>{
    const reply=formatTelegramBotReply({kind:'orders',locale:'en',orders:Array.from({length:10},(_,i)=>({id:String(i),title:'x'.repeat(1000),client:'y'.repeat(1000)}))},config);
    expect(reply.text.length<=4000).toBe(true);
    expect(formatTelegramBotReply({kind:'read',result:'not_found',locale:'en'},config).text).toBe('This notification is unavailable.');
  });
  it('sends only a bounded question/context with read-only instructions and account language',async()=>{
    let captured:any;
    const complete:any=async(messages:any,options:any)=>{captured={messages,options};return 'Šodien paredzēta viena iekraušana.';};
    const answer=await answerTelegramQuestion({kind:'ask',personalAiAllowed:true,locale:'lv',question:'Kas notiek šodien?',date:'2026-10-22',orders:[{po_number:'PO1'}],events:[],notifications:[]},complete);
    expect(captured.messages[0].content.includes('Latvian')).toBe(true);
    expect(captured.messages[0].content.includes('cannot change orders')).toBe(true);
    expect(captured.options.maxTokens).toBe(900);expect(captured.options.timeoutMs).toBe(20000);
    expect(captured.options.tools).toBe(undefined);
    expect(answer.includes('viena iekraušana')).toBe(true);
  });
  it('returns a localized safe fallback without provider error details',async()=>{
    const complete:any=async()=>{throw new Error(config.botToken);};
    const answer=await answerTelegramQuestion({personalAiAllowed:true,locale:'ru',question:'Что сегодня?'},complete);
    expect(answer.includes('ИИ-помощник недоступен')).toBe(true);
    expect(answer.includes(config.botToken)).toBe(false);
  });
  it('persists rendered AI answers before send and retries without repeating inference',async()=>{
    const state:any={status:'pending',attempts:0,payload:{kind:'ask',personalAiAllowed:true,locale:'en',question:'What is due?',orders:[]}};
    const db:any={rpc:async(name:string,args:any)=>{
      if(name==='get_telegram_settings')return {data:null,error:null};
      if(name==='claim_telegram_bot_replies')return {data:state.status==='pending'?[{id:'reply',claim_token:'lease',attempts:++state.attempts}]:[],error:null};
      if(name==='telegram_bot_reply_payload')return {data:{chatId:'1234',payload:state.payload},error:null};
      if(name==='prepare_telegram_bot_reply'){state.payload={kind:'ask',personalAiAllowed:true,locale:'en',rendered:args.p_text,keyboard:args.p_keyboard};return {data:true,error:null};}
      if(name==='finish_telegram_bot_reply'){state.status=args.p_status;return {data:true,error:null};}
      throw new Error('Unexpected RPC');
    }};
    let inference=0,sends=0;
    const complete:any=async()=>{inference++;return 'PO1 is due today.';};
    const fetcher:any=async()=>++sends===1?Response.json({ok:false,error_code:429,parameters:{retry_after:20}},{status:429}):Response.json({ok:true,result:{message_id:123}});
    await dispatchTelegramBotReplies(config,db,{complete,fetcher});
    expect(state.status).toBe('pending');expect(state.payload.question).toBe(undefined);
    await dispatchTelegramBotReplies(config,db,{complete,fetcher});
    expect(state.status).toBe('sent');expect(inference).toBe(1);expect(sends).toBe(2);
  });
  it('cancels a reply when permission is revoked during inference',async()=>{
    let reads=0,sends=0,finalStatus='';
    const db:any={rpc:async(name:string,args:any)=>{
      if(name==='get_telegram_settings')return {data:null,error:null};
      if(name==='claim_telegram_bot_replies')return {data:[{id:'reply',claim_token:'lease',attempts:1}],error:null};
      if(name==='telegram_bot_reply_payload')return {data:++reads===1?{chatId:'1234',payload:{kind:'ask',personalAiAllowed:true,question:'What is due?'}}:null,error:null};
      if(name==='prepare_telegram_bot_reply')return {data:true,error:null};
      if(name==='finish_telegram_bot_reply'){finalStatus=args.p_status;return {data:true,error:null};}
      throw new Error('Unexpected RPC');
    }};
    await dispatchTelegramBotReplies(config,db,{complete:(async()=> 'Answer') as any,fetcher:async()=>{sends++;return Response.json({ok:true,result:{message_id:1}});}});
    expect(sends).toBe(0);expect(finalStatus).toBe('cancelled');
  });
  it('applies RD batch and retry ceilings to notification delivery',async()=>{
    let limit=0,finish:any;
    const db:any={rpc:async(name:string,args:any)=>{
      if(name==='get_telegram_settings')return {data:null,error:null};
      if(name==='claim_telegram_deliveries'){limit=args.p_limit;return {data:[{id:'notification',claim_token:'lease',attempts:2}],error:null};}
      if(name==='telegram_delivery_payload')return {data:{chatId:'1234',notification:{title:'Order ready'}},error:null};
      if(name==='finish_telegram_delivery'){finish=args;return {data:true,error:null};}
    }};
    await dispatchTelegramDeliveries({...config,options:{...config.options!,batchSize:3,maxAttempts:2,concurrency:1}},db,{fetcher:async()=>Response.json({ok:false,error_code:500},{status:500})});
    expect(limit).toBe(3);expect(finish.p_status).toBe('failed');
  });
});
