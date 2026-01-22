function o(t="id"){if(typeof crypto<"u"&&typeof crypto.randomUUID=="function")return crypto.randomUUID();const n=Math.random().toString(16).slice(2);return`${t}-${Date.now()}-${n}`}export{o as c};
