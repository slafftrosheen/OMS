/** Retain a Mini App/deep-link destination without creating an open redirect. */
export function safeLoginDestination(value:string|null,base=''){
 if(!value||!value.startsWith('/')||value.startsWith('//')||(value.includes('\\')||Array.from(value).some(char=>char.charCodeAt(0)<=32)))return base+'/orders';
 const path=value.split(/[?#]/)[0];
 if(base&&path!==base&&!path.startsWith(base+'/'))return base+'/orders';
 if(path===base+'/login')return base+'/orders';
 return value;
}
