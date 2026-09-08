import assert from 'node:assert/strict';
import { openInventoryFilterPopout } from '../src/lib/inventoryFilterPopout.js';
import { calculateFilterResult } from '../src/lib/filtersCore.js';
import { makeRuntimeFixture } from './filtersRuntime/fixture.mjs';

class Node extends EventTarget {
    constructor(tag){super();this.tag=tag;this.children=[];this.dataset={};this.style={};this.textContent='';}
    append(...nodes){for(const n of nodes)this.children.push(...(n.tag==='fragment'?n.children:[n]));}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    setAttribute(){}
    scrollIntoView(){}
}
const nodes=[];
const document={body:new Node('body'),open(){},close(){},write(html){assert.ok(!html.includes('G::Estado'));},
    createElement(tag){const n=new Node(tag);nodes.push(n);return n;},createDocumentFragment:()=>new Node('fragment')};
const f=makeRuntimeFixture({sources:['m1','m2']});
const popup=new EventTarget();Object.assign(popup,{document,closed:false,opener:{postMessage(){}},close(){this.closed=true;this.dispatchEvent(new Event('beforeunload'));}});
f.host.open=()=>popup;f.host.location={origin:'https://test.invalid'};
const calculate=(revision,patch={})=>calculateFilterResult({...f.state,...patch},f.snapshot(),revision);
f.host.__filterResult=calculate(1);let closed=0;
openInventoryFilterPopout({host:f.host,scopeId:'front',columns:[{key:'dbId',header:'ID'}],assetsOnly:false,selection:null,onClose:()=>closed++});
assert.equal(closed,1);
const tbody=nodes.find(n=>n.tag==='tbody'),status=nodes.find(n=>n.tag==='p');
assert.equal(tbody.children.length,6);
f.host.dispatchEvent(new CustomEvent('inventory-highlight-row',{detail:{urn:'m2',dbId:1}}));
assert.equal(tbody.children[3].style.background,'#2a4a8a');
assert.notEqual(tbody.children[0].style.background,'#2a4a8a');
const oldRow=tbody.children[3];let selected;
f.host.addEventListener('viewer-select',e=>selected=e.detail);
oldRow.dispatchEvent(new Event('click'));assert.deepEqual(selected,{urn:'m2',dbIds:[1]});
f.host.__filterResult=calculate(2,{filterSelections:{'G::Estado':['Pendiente']}});f.host.dispatchEvent(new Event('filter-result'));
assert.equal(tbody.children.length,2);assert.ok(status.textContent.includes('revisión 2'));
selected=null;oldRow.dispatchEvent(new Event('click'));assert.equal(selected,null);
f.host.__filterResult=calculate(3,{filterSelections:{'G::Estado':['missing']}});f.host.dispatchEvent(new Event('filter-result'));
assert.equal(tbody.children.length,0);assert.ok(status.textContent.includes('0 coincidencias'));
f.host.__filterResult=calculate(4);f.host.dispatchEvent(new Event('filter-result'));assert.equal(tbody.children.length,6);
f.host.__filterResult={revision:5,scopeId:'front',status:'pending'};f.host.dispatchEvent(new Event('filter-result'));assert.equal(tbody.children.length,0);
f.host.__filterResult={revision:6,scopeId:'other',status:'pending'};f.host.dispatchEvent(new Event('filter-result'));assert.ok(status.textContent.includes('frente cambió'));
popup.close();assert.equal(f.host.__inventoryPopup,null);assert.equal(f.host.__inventoryPopupCleanup,null);
console.log(JSON.stringify({suite:'filtersCore.popout',pass:1,assertions:16,limits:'Production popup renderer with local DOM/event doubles; no browser window or GPU.'}));
