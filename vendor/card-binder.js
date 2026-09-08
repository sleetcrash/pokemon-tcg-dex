// card-binder v1.1.0 (2026-09-08)
// card-binder: a pocket-page binder as a physical object. Zero dependencies, ES module.
// new CardBinder(host, {items, renderItem, cols, rows, label, spreadMinWidth, fit, pager, sizePicker, startClosed, onChange})
//   items        array of anything; renderItem(item, index) returns the element that sits in a pocket (give it the pocket aspect)
//   cols, rows   pockets per page (1 to 6 each); label {title, subtitle} prints on the covers
//   spreadMinWidth  viewport width from which two pages face each other (default 1000); below it one page at a time
//   fit          on a spread, size the book from the viewport height so a whole spread shows (default true); set --cb-reserve on the host
//   pager        render the built-in pager under the book (default true); sizePicker adds a cols x rows picker to it (default false)
//   startClosed  begin on the shut front cover (default true); keys: arrow keys turn pages (default true; off when items handle arrows)
//   onChange(state) fires after every render with {page, closed, pages, total, spread, cols, rows}
// Pages pair like a real binder: inside front cover + page 1, then 2 + 3, and the last page sits alone on the left facing the
// inside back cover; an odd page count gets one empty pocket page as its last side. `page` is the right leaf's index (0-based).
export class CardBinder{
  constructor(host,o={}){
    this.host=host;this.items=o.items||[];this.renderItem=o.renderItem||(x=>{const d=document.createElement("div");d.textContent=String(x);return d});
    this.cols=o.cols||3;this.rows=o.rows||3;this.label=o.label||{};this.fit=o.fit!==false;this.onChange=o.onChange||(()=>{});
    this.page=0;this.closed=o.startClosed===false?null:"front";
    this.mq=matchMedia(`(min-width:${o.spreadMinWidth||1000}px)`);this.mq.addEventListener("change",()=>this.render());
    host.classList.add("cb-host");host.innerHTML=`<div class="cb-book"><div class="cb-leaf"><div class="cb-grid"></div></div><div class="cb-leaf" hidden><div class="cb-grid"></div></div></div>`;
    this.book=host.firstElementChild;[this.leafL,this.leafR]=this.book.children;
    this.book.addEventListener("click",()=>{if(this.closed)this.turn(this.closed==="front"?1:-1)});
    if(o.keys!==false)host.addEventListener("keydown",e=>{if(e.target.closest("input"))return;if(e.key==="ArrowRight")this.turn(1);else if(e.key==="ArrowLeft")this.turn(-1)});
    if(o.pager!==false)this.mountPager(o.sizePicker);
    this.render();
  }
  get spread(){return this.mq.matches}
  get per(){return this.cols*this.rows}
  get pages(){return Math.max(1,Math.ceil(this.items.length/this.per))}
  get total(){return this.spread&&this.pages%2?this.pages+1:this.pages}
  get last(){return this.spread?this.total:this.pages-1}
  setItems(items){this.items=items;this.page=0;this.render()}
  setGrid(cols,rows){this.cols=Math.min(6,Math.max(1,cols));this.rows=Math.min(6,Math.max(1,rows));this.page=0;this.render()}
  goTo(n){this.closed=null;this.page=Math.min(Math.max(0,n),this.pages-1);this.render()}
  open(){if(this.closed==="back")this.page=this.last;this.closed=null;this.render()}
  close(side="front"){this.closed=side;this.render()}
  turn(dir){
    if(this.closed==="front"){if(dir<0)return;this.closed=null}
    else if(this.closed==="back"){if(dir>0)return;this.closed=null;this.page=this.last}
    else if(dir>0&&this.page>=this.last)this.closed="back";
    else if(dir<0&&this.page<=0)this.closed="front";
    else this.page+=dir*(this.spread?2:1);
    this.render();
  }
  cover(cls){
    const c=document.createElement("div");c.className="cb-incover"+(cls?" cb-"+cls:"");
    const l=document.createElement("span");l.className="cb-lbl";l.textContent=this.label.title||"";
    if(this.label.subtitle){const s=document.createElement("small");s.textContent=this.label.subtitle;l.appendChild(s)}
    if(this.label.title)c.appendChild(l);return c;
  }
  fill(leaf,p){
    const grid=leaf.firstElementChild,cov=p<0||p>=this.total;
    leaf.classList.toggle("cb-cov",cov);leaf.dataset.p=cov?"":p+1;grid.innerHTML="";
    if(cov){grid.appendChild(this.cover(this.closed));return}
    const slice=p<this.pages?this.items.slice(p*this.per,p*this.per+this.per):[];
    slice.forEach((it,i)=>{const w=document.createElement("div");w.className="cb-pkt";w.appendChild(this.renderItem(it,p*this.per+i));grid.appendChild(w)});
    for(let i=slice.length;i<this.per;i++){const b=document.createElement("div");b.className="cb-pkt cb-empty";grid.appendChild(b)}
  }
  render(){
    const two=this.spread,h=this.host,s=h.style;
    s.setProperty("--cb-cols",this.cols);s.setProperty("--cb-rows",this.rows);
    if(!h.style.getPropertyValue("--cb-gap-fixed"))s.setProperty("--cb-gap",this.cols>=5?"8px":this.cols===4?"10px":"14px");
    h.classList.toggle("cb-two",two);h.classList.toggle("cb-fit",two&&this.fit);
    this.page=Math.min(Math.max(0,this.page),two?this.total:this.pages-1);
    if(two&&this.page%2)this.page++;
    const b=this.book.classList;b.toggle("cb-spread",two&&!this.closed);b.toggle("cb-closed",!!this.closed);b.toggle("cb-front",this.closed==="front");b.toggle("cb-back",this.closed==="back");
    this.leafR.hidden=!two||!!this.closed;
    if(this.closed)this.fill(this.leafL,-1);else if(two){this.fill(this.leafL,this.page-1);this.fill(this.leafR,this.page)}else this.fill(this.leafL,this.page);
    if(this.pager)this.paintPager();
    this.onChange(this.state);
  }
  get state(){return {page:this.page,closed:this.closed,pages:this.pages,total:this.total,spread:this.spread,cols:this.cols,rows:this.rows}}
  mountPager(sizePicker){
    const p=document.createElement("div");p.className="cb-pager";
    p.innerHTML=`<button type="button" data-go="first" aria-label="Front cover">&#171;</button><button type="button" data-go="prev" aria-label="Previous page">&#8249;</button><span class="cb-pgo"><input type="number" min="1" inputmode="numeric" aria-label="Page number"><span class="cb-tot"></span></span><button type="button" data-go="next" aria-label="Next page">&#8250;</button><button type="button" data-go="last" aria-label="Back cover">&#187;</button>`;
    p.addEventListener("click",e=>{const g=e.target.closest("[data-go]");if(!g)return;({first:()=>this.close("front"),prev:()=>this.turn(-1),next:()=>this.turn(1),last:()=>this.close("back")})[g.dataset.go]()});
    const inp=p.querySelector("input");inp.addEventListener("change",()=>this.goTo((parseInt(inp.value,10)||1)-1));inp.addEventListener("keydown",e=>{if(e.key==="Enter")inp.blur()});
    if(sizePicker)p.appendChild(this.sizePicker());
    this.host.appendChild(p);this.pager=p;
  }
  paintPager(){
    const p=this.pager,inp=p.querySelector("input"),tot=p.querySelector(".cb-tot"),two=this.spread,c=this.closed;
    inp.max=this.total;inp.hidden=!!c;
    if(c){inp.value="";tot.textContent=c==="front"?"Front cover":"Back cover"}
    else{const left=two?this.page:this.page+1;inp.value=two&&this.page>=this.total?this.total:Math.max(1,left);tot.textContent=two&&this.page>0&&this.page<this.total?`+ ${this.page+1} / ${this.total}`:`/ ${this.total}`}
    p.querySelector('[data-go="first"]').disabled=p.querySelector('[data-go="prev"]').disabled=c==="front";
    p.querySelector('[data-go="next"]').disabled=p.querySelector('[data-go="last"]').disabled=c==="back";
    const sb=p.querySelector(".cb-size>button");if(sb)sb.textContent=`${this.cols} × ${this.rows}`;
  }
  sizePicker(){
    const w=document.createElement("div");w.className="cb-size";
    w.innerHTML=`<button type="button" aria-label="Pockets per page"></button><div class="cb-pop" hidden><div></div><div class="cb-slbl"></div></div>`;
    const btn=w.firstElementChild,pop=w.lastElementChild,grid=pop.firstElementChild,lbl=pop.lastElementChild;
    const hi=(c,r)=>{[...grid.children].forEach(el=>el.classList.toggle("cb-hi",+el.dataset.c<=c&&+el.dataset.r<=r));lbl.textContent=`${c} × ${r}`};
    for(let r=1;r<=6;r++)for(let c=1;c<=6;c++){const b=document.createElement("button");b.type="button";b.dataset.c=c;b.dataset.r=r;b.setAttribute("aria-label",`${c} by ${r}`);b.addEventListener("mouseenter",()=>hi(c,r));b.addEventListener("click",()=>{this.setGrid(c,r);pop.hidden=true});grid.appendChild(b)}
    btn.addEventListener("click",()=>{pop.hidden=!pop.hidden;if(!pop.hidden)hi(this.cols,this.rows)});
    document.addEventListener("pointerdown",e=>{if(!w.contains(e.target))pop.hidden=true},{passive:true});
    return w;
  }
}
