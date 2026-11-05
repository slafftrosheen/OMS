import {describe,it,expect,beforeEach} from 'vitest';
import {get} from 'svelte/store';
import {addMessages,init,t,locale} from '../../packages/svelte-i18n/index.js';

describe('shared translated values',()=>{
 beforeEach(async()=>{
  addMessages('en',{progress:'{completed} of {total}',client:'{name}',fallback:'Hello {name}'});
  addMessages('ru',{progress:'Готово: {completed} из {total}'});
  await init({initialLocale:'en',fallbackLocale:'en'});
 });
 it('renders nested values, including zero, in production progress summaries',()=>{
  expect(get(t)('progress',{values:{completed:0,total:4}})).toBe('0 of 4');
  locale.set('ru');
  expect(get(t)('progress',{values:{completed:2,total:4}})).toBe('Готово: 2 из 4');
  expect(get(t)('fallback',{values:{name:'Alex'}})).toBe('Hello Alex');
 });
 it('preserves flat parameters and literal replacement values',()=>{
  locale.set('en');
  expect(get(t)('client',{name:'Client $& {test}'})).toBe('Client $& {test}');
  expect(get(t)('missing',{default:'Count: {count}',values:{count:0}})).toBe('Count: 0');
  expect(get(t)('progress',{completed:1,total:3,values:null})).toBe('1 of 3');
 });
});
