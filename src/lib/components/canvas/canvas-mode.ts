import { createContext } from 'react';
// Fail closed: legacy chat nodes never reveal messages until a host explicitly
// identifies itself as a private order canvas.
export const CanvasModeContext = createContext<'toolkit' | 'order'>('toolkit');
