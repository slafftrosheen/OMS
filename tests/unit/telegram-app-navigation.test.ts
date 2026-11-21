import {describe,it,expect} from 'vitest';
import {safeLoginDestination} from '../../src/lib/auth/login-destination';
import {telegramLaunchDestination, telegramNotificationPath, telegramOrderLaunchPath} from '../../src/lib/telegram/launch';
import {telegramAppButton} from '../../src/lib/server/notifications/telegram';
describe('Telegram app navigation',()=>{
 it('opens production destinations only through known Mini App routes',()=>{
  const id='12345678-1234-1234-1234-123456789abc';
  const launch=telegramOrderLaunchPath(id)!;
  expect(telegramLaunchDestination(new URL(launch,'https://oms.test').searchParams)).toBe('/orders/'+id);
  expect(telegramLaunchDestination(new URLSearchParams('view=calendar'))).toBe('/calendar');
  for(const value of ['view=order&id=//evil.test','view=https://evil.test','view=order&id=../../settings'])
   expect(telegramLaunchDestination(new URLSearchParams(value))).toBe(null);
  expect(telegramOrderLaunchPath('-'.repeat(36))).toBe(null);
 });
 it('keeps notification links on the OMS origin',()=>{
  expect(telegramNotificationPath('/orders/123?view=details#files')).toBe('/orders/123?view=details#files');
  for(const value of ['//evil.test','/\\evil.test','https://evil.test','javascript:alert(1)','/ /evil.test'])
   expect(telegramNotificationPath(value)).toBe(null);
 });
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
