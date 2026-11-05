import {error,json} from '@sveltejs/kit';
import type {RequestHandler} from './$types';
import {createOrderIntakeHandler} from '$lib/server/order/intake';

export const POST=createOrderIntakeHandler();
/** Availability only: no provider request, credential, or private model ID. */
export const GET:RequestHandler=async({locals})=>{
 if(!locals.user)throw error(401,'Unauthorized');
 return json({nativePdf:!!process.env.OPENROUTER_ORDER_INTAKE_PDF_MODEL?.trim(),
  paidOcr:process.env.OPENROUTER_TOOLKIT_PDF_OCR==='true'},
  {headers:{'Cache-Control':'private, no-store'}});
};
