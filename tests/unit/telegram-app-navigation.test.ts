import {describe,it,expect} from 'vitest';
import {safeLoginDestination} from '../../src/lib/auth/login-destination';
import {telegramAppButton} from '../../src/lib/server/notifications/telegram';
describe('Telegram app navigation',()=>{
 it('preserves the protected app destination through login without allowing external redirects',()=>{
  expect(safeLoginDestination('/telegram?tab=control')).toBe('/telegram?tab=control');
  for(const value of ['//evil.test','/\\evil.test','https://evil.test','/login',null])expect(safeLoginDestination(value)).toBe('/orders');
  expect(safeLoginDestination('/telegram','/oms')).toBe('/oms/orders');
 });
 it('only creates native app launch buttons for HTTPS and retains an HTTP navigation fallback',()=>{
  expect(telegramAppButton({appUrl:'https://oms.test'},'App')).toEqual({text:'App',web_app:{url:'https://oms.test/telegram'}});
  expect(telegramAppButton({appUrl:'http://oms.test'},'App')).toEqual({text:'App',url:'http://oms.test/telegram'});
  expect(telegramAppButton({appUrl:'javascript:alert(1)'},'App')).toBe(null);
 });
});
