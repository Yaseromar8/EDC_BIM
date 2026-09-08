// Event/geometry double for popout lifecycle tests. Native-browser scale fitness is separate.
export class PopoutNode extends EventTarget {
    constructor(tag){super();this.tag=tag;this.children=[];this.dataset={};this.style={};this.textContent='';this.parentNode=null;this.clientHeight=480;this.scrollTop=0;}
    append(...nodes){for(const node of nodes) {
        if(node.tag==='fragment') {this.append(...node.children);node.children=[];}
        else {node.parentNode=this;this.children.push(node);}
    }}
    replaceChildren(...nodes){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...nodes);}
    contains(node){return node===this || this.children.some(child=>child.contains(node));}
    dispatchEvent(event){
        if(!Object.hasOwn(event,'target')) Object.defineProperty(event,'target',{value:this,configurable:true});
        const result=super.dispatchEvent(event);
        if(event.bubbles && !event.cancelBubble && this.parentNode)this.parentNode.dispatchEvent(event);
        return result;
    }
    setAttribute(name,value){(this.attributes??={})[name]=value;}
}
export function makePopoutDom(host) {
    const nodes=[],frames=new Map();let nextFrame=0;
    const document={body:new PopoutNode('body'),open(){},close(){},write(){},
        createElement(tag){const n=new PopoutNode(tag);nodes.push(n);return n;},
        createDocumentFragment:()=>new PopoutNode('fragment')};
    const popup=new EventTarget();
    Object.assign(popup,{document,closed:false,opener:{postMessage(){}},
        requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},
        cancelAnimationFrame(id){frames.delete(id);},
        close(){this.closed=true;this.dispatchEvent(new Event('beforeunload'));}});
    host.open=()=>popup;host.location={origin:'https://test.invalid'};
    const flush=()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();};
    return {popup,document,nodes,frames,flush,
        find:tag=>nodes.find(n=>n.tag===tag),
        dataRows:()=>nodes.find(n=>n.tag==='tbody').children.filter(n=>n.dataset.rowKey),
        liveNodes:()=>{let count=0;const visit=n=>{count++;n.children.forEach(visit);};visit(document.body);return count;}};
}
