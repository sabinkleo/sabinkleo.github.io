import assert from 'node:assert/strict';
import {catalogRoute} from '../assets/ai-client.mjs';
for (const [query,lang,path] of [
 ['Vendas','pt','/raio-x-vendas/'], ['sales','en','/raio-x-vendas/'],
 ['conversão de leads','pt','/raio-x-vendas/'], ['estoque','pt','/n1/'],
 ['news','en','/observatorio/'], ['mecatrônica','pt','/estudos/mecatronica/'],
 ['creative','en','/klein/'], ['crypto','en','/radar-ia-cripto/']
]) assert.equal(catalogRoute(query,lang)?.href,path,query);
for (const query of ['zzzz-no-match','Gemini 429','FT550 turbo','Linux SSH'])
 assert.equal(catalogRoute(query),null,query);
console.log('Catalog routing regressions passed');
