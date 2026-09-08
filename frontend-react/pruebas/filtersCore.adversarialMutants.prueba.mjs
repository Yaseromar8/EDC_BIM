// Mutate production sources only in memory; no working-tree copies or DB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const engineUrl = new URL('../src/aps/utils/model.js', import.meta.url);
const preflightUrl = new URL('../src/lib/preflightFiltros.js', import.meta.url);
const testUrl = new URL('./filtersCore.adversarial.prueba.mjs', import.meta.url);
const absoluteImports = (source, base) => source.replace(/from '(\.[^']+)'/g, (_, path) => 'from ' + JSON.stringify(new URL(path, base).href));
const engine = absoluteImports(readFileSync(engineUrl,'utf8').replace(/\r\n/g,'\n'),engineUrl);
const preflight = absoluteImports(readFileSync(preflightUrl,'utf8').replace(/\r\n/g,'\n'),preflightUrl);
const fitness = absoluteImports(readFileSync(testUrl,'utf8'),testUrl)
    .replace("new URL('./restaurarVistaV2.prueba.mjs', import.meta.url)",
        "new URL("+JSON.stringify(new URL('./restaurarVistaV2.prueba.mjs',import.meta.url).href)+")");
const restoreUrl = new URL('../src/lib/restaurarVistaV2.js', import.meta.url);
const restore = absoluteImports(readFileSync(restoreUrl,'utf8'),restoreUrl);
function replaceOnce(source,before,after) {
    assert.equal(source.split(before).length,2,'mutation locator drift');
    return source.replace(before,after);
}
const mutants=[
    ['preflight-flat-only', preflightUrl.href,
      replaceOnce(preflight,'readFilterProperty(fila, propId, owners)','fila[nombreDeColumna(propId)]'),
      'L3/real-restore-must-preserve-valid-qualified-selection'],
    ['homonym-request-only',engineUrl.href,
      replaceOnce(engine,'knownPropertyNames(allData)','knownPropertyNames([])'),
      'L2/homonym-only-one-group-requested'],
    ['rosetta-content-erased',engineUrl.href,
      replaceOnce(engine,'[urn, Object.entries(mapping || {})]','[urn, Object.keys(mapping || {}).length]'),
      'L2/rosetta-rebuild-same-count-key-length']
];
let killed=0;
for(const [name,url,source,target] of mutants) {
    let code=fitness.replace(JSON.stringify(url),JSON.stringify(data(source)));
    if(url===preflightUrl.href) code=code.replace(JSON.stringify(restoreUrl.href),
        JSON.stringify(data(restore.replace(JSON.stringify(url),JSON.stringify(data(source))))));
    const result=spawnSync(process.execPath,['--input-type=module'],{input:code,encoding:'utf8'});
    const rows=result.stdout.split(/\r?\n/).filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));
    const found=rows.find(row=>row.id===target);
    assert.equal(found?.status,'FAIL',name+': '+result.stderr);
    assert.equal(result.status,1,name);
    killed++;
    console.log(JSON.stringify({name,killed:true}));
}
console.log(JSON.stringify({mutants:mutants.length,killed}));
