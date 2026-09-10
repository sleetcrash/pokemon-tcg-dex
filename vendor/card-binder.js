// card-binder v2.4.0 (2026-09-10)
// card-binder: a pocket-page binder as a physical object. Zero dependencies, ES module.
// new CardBinder(host, {items, renderItem, cols, rows, name, inside, progress, progressLabel, cover, font, spreadMinWidth, fit, pager, sizePicker, startClosed, keys, swipe, animate, onChange})
//   items        array of anything; renderItem(item, index) returns the element that sits in a pocket (give it the pocket aspect)
//   cols, rows   pockets per page (1 to 6 each)
//   name         pressed into the shut front cover and printed on the contents card
//   inside       [[label, value], ...] rows for the contents card on the inside front cover (the name and progress join it)
//   progress     0 to 1, drawn as a bar under every page and on the contents card; progressLabel prints beside it
//   cover        a CSS colour for the cover (a #rrggbb value also picks a light or dark progress fill and imprint direction)
//   font         a CSS colour for the pressed title's groove and the progress fill; unset, both derive from the cover
//   spreadMinWidth  viewport width from which two pages face each other (default 1000); below it one page at a time
//   fit          on a spread, size the book from the viewport height so a whole spread shows (default true); set --cb-reserve on the host
//   pager        render the built-in pager under the book (default true); sizePicker adds a cols x rows picker to it (default false)
//   startClosed  begin on the shut front cover (default true); keys: arrow keys turn pages (default true; off when items handle arrows)
//   swipe        a sideways touch or pen swipe across the book turns the page (default true)
//   animate      page turns move like one sheet: the turning page flips over the spine with the next page on its back (default true)
//   onChange(state) fires after every render with {page, closed, pages, total, spread, cols, rows}
// Pages pair like a real binder: inside front cover + page 1, then 2 + 3, and the last page sits alone on the left facing the
// inside back cover; an odd page count gets one empty pocket page as its last side. `page` is the right leaf's index (0-based).
// One page at a time (below spreadMinWidth) the inside front cover is its own page, index -1, so the contents card is reachable.
// perspective distance for a turn, in page widths: the free edge of a swinging page grows by at most 1 / (1 - 1 / PERSP)
const PERSP=10;
export class CardBinder{
  static VERSION="2.4.0";
  constructor(host,o={}){
    this.host=host;this.items=o.items||[];this.renderItem=o.renderItem||(x=>{const d=document.createElement("div");d.textContent=String(x);return d});
    this.cols=o.cols||3;this.rows=o.rows||3;this.name=o.name||"";this.font="";this.cover="";this.inside=o.inside||[];this.progress=o.progress;this.progressLabel=o.progressLabel||"";
    this.fit=o.fit!==false;this.animate=o.animate!==false;this.onChange=o.onChange||(()=>{});
    this.page=0;this.closed=o.startClosed===false?null:"front";this.swiped=false;
    this.mq=matchMedia(`(min-width:${o.spreadMinWidth||1000}px)`);this.mq.addEventListener("change",()=>this.render());
    host.classList.add("cb-host");host.innerHTML=`<div class="cb-book"><div class="cb-leaf"><div class="cb-grid"></div><div class="cb-foot"></div></div><div class="cb-leaf" hidden><div class="cb-grid"></div><div class="cb-foot"></div></div></div>`;
    this.book=host.firstElementChild;[this.leafL,this.leafR]=this.book.children;
    this.book.addEventListener("click",()=>{if(this.swiped)return;if(this.closed)this.turn(this.closed==="front"?1:-1)});
    if(o.keys!==false)host.addEventListener("keydown",e=>{if(e.target.closest("input"))return;if(e.key==="ArrowRight")this.turn(1);else if(e.key==="ArrowLeft")this.turn(-1)});
    if(o.swipe!==false)this.armSwipe();
    if(o.cover)this.setCover(o.cover);
    if(o.font)this.setFont(o.font);
    if(o.pager!==false)this.mountPager(o.sizePicker);
    this.render();
  }
  get spread(){return this.mq.matches}
  get per(){return this.cols*this.rows}
  get pages(){return Math.max(1,Math.ceil(this.items.length/this.per))}
  get total(){return this.spread&&this.pages%2?this.pages+1:this.pages}
  get last(){return this.spread?this.total:this.pages-1}
  get first(){return this.spread?0:-1}
  setItems(items){this.items=items;this.page=0;this.render()}
  setGrid(cols,rows){this.cols=Math.min(6,Math.max(1,cols));this.rows=Math.min(6,Math.max(1,rows));this.page=0;this.render()}
  goTo(n){this.closed=null;this.page=Math.min(Math.max(0,n),this.pages-1);this.render()}
  open(){this.page=this.closed==="back"?this.last:this.first;this.closed=null;this.render()}
  close(side="front"){this.closed=side;this.render()}
  turn(dir){
    const was=this.closed,snap=this.animate&&!matchMedia("(prefers-reduced-motion: reduce)").matches?this.snapshot():null;
    if(this.closed==="front"){if(dir<0)return;this.closed=null;this.page=this.first}
    else if(this.closed==="back"){if(dir>0)return;this.closed=null;this.page=this.last}
    else if(dir>0&&this.page>=this.last)this.closed="back";
    else if(dir<0&&this.page<=this.first)this.closed="front";
    else this.page+=dir*(this.spread?2:1);
    this.render();
    if(snap)this.flip(snap,dir,was);
  }
  snapshot(){const c=l=>l.hidden?null:l.cloneNode(true);return {L:c(this.leafL),R:c(this.leafR)}}
  // one sheet turns: a ghost of the page that lifts, with the page it reveals printed on its back, swings over the spine and lands on
  // the far leaf while a ghost of the page it covers stays put; one page at a time the old page lifts away (or the previous one drops in).
  // A turn already in flight is flushed first, so two quick turns never stack their ghosts. The ghosts live in the host (which keeps
  // its shape) at the positions the leaves have after the render; a cover opening keeps the book in its shut shape, with the landing
  // leaf out of the layout, until the board lands, so the far half of the cover does not appear before the board gets there
  flip(snap,dir,was){
    if(this.endTurn)this.endTurn();
    const host=this.host,book=this.book,L=this.leafL,R=this.leafR,gone=[],hr=host.getBoundingClientRect();let opened=null;
    // a ghost sits on whole screen pixels: the edge of a transformed layer is blended with the page behind it, and at the spine that read as a light line
    const ghost=(el,r)=>{el.hidden=false;el.inert=true;el.classList.add("cb-ghost");const l=Math.round(r.left),t=Math.round(r.top);el.style.left=l-hr.left+"px";el.style.top=t-hr.top+"px";el.style.width=Math.round(r.left+r.width)-l+"px";el.style.height=Math.round(r.top+r.height)-t+"px";host.appendChild(el);gone.push(el);return el};
    const rect=el=>el.getBoundingClientRect();
    host.style.setProperty("--cb-persp",Math.round(L.offsetWidth*PERSP)+"px");
    if(this.spread){
      const cs=getComputedStyle(host),px=p=>parseFloat(cs.getPropertyValue(p))||0,spine=px("--cb-spine");
      const land=dir>0?L:(R.hidden?L:R),front=dir>0?(snap.R||snap.L):snap.L,under=dir>0?(snap.R?snap.L:null):snap.R;
      if(!front)return;
      const lr=rect(land);
      if(under)ghost(under,lr);
      // a cover turn swings the whole board: the leaf inside the cover's rim, rounded edge and shadow (.cb-board), in the shut book's box
      const cov=front.classList.contains("cb-cov");
      // the back face is drawn mirrored (it reads right once the flier has turned), so its spine side is the opposite edge; a board
      // carrying an inside cover (.cb-inside) draws its half of the spine shading
      const face=(leaf,side,...cls)=>{let f=leaf;if(cov){f=document.createElement("div");f.className="cb-board "+side+(leaf.dataset.cov.startsWith("in-")?" cb-inside":"");f.appendChild(leaf)}f.classList.add("cb-face",...cls);return f};
      const fl=document.createElement("div"),back=land.cloneNode(true);
      fl.className="cb-flier";fl.append(face(front,dir>0?"cb-sl":"cb-sr"),face(back,dir>0?"cb-sr":"cb-sl","cb-back"));
      if(!under){opened=land;land.hidden=true;this.layout(was)}
      let box;
      if(cov){
        // the book is shut now (it stayed shut for an open, render() shut it for a close), and the board takes its box on the whole pixels
        // the book paints on, so board and book meet at the spine with no gap and no blended edge; an open starts on the book, a shut starts
        // on the far half and lands on the book
        const B=rect(book),l=Math.round(B.left),W=Math.round(B.right)-l;
        box={left:was?l:dir>0?l+W:l-W,top:B.top,width:W,height:B.height};
      }else box={left:dir>0?lr.right+spine:lr.left-spine-lr.width,top:lr.top,width:lr.width,height:lr.height};
      ghost(fl,box);
      const ax=cov?0:-spine/2;
      fl.style.transformOrigin=dir>0?`${ax}px 50%`:`calc(100% - ${ax}px) 50%`;
      fl.classList.add(dir>0?"cb-fwd":"cb-back");
    }else if(dir>0){if(!snap.L)return;ghost(snap.L,rect(L)).classList.add("cb-lift")}
    else{if(snap.L)ghost(snap.L,rect(L));ghost(L.cloneNode(true),rect(L)).classList.add("cb-drop")}
    book.classList.add("cb-turning");
    let done=false;
    const end=()=>{if(done)return;done=true;this.endTurn=null;gone.forEach(g=>g.remove());if(opened){opened.hidden=false;this.layout(this.closed)}book.classList.remove("cb-turning")};
    this.endTurn=end;
    gone[gone.length-1].addEventListener("animationend",end,{once:true});
    const t=getComputedStyle(book).getPropertyValue("--cb-turn").trim(),ms=t.endsWith("ms")?parseFloat(t):parseFloat(t)*1000;
    setTimeout(end,(ms||750)+250);
  }
  // the name, the contents rows and the progress repaint in place; nothing in a pocket is rebuilt
  setName(name){this.name=name||"";this.paintFeet();this.paintCovers()}
  setInside(rows){this.inside=rows||[];this.paintCovers()}
  setProgress(value,label){this.progress=value;this.progressLabel=label||"";this.paintFeet();this.paintCovers()}
  setCover(c){
    const s=this.host.style;this.cover=c||"";
    const thread=v=>{if(!this.font){if(v)s.setProperty("--cb-thread",v);else s.removeProperty("--cb-thread")}};
    if(!c){["--cb-cover","--cb-cover-hi","--cb-press"].forEach(p=>s.removeProperty(p));thread(null);return}
    s.setProperty("--cb-cover",c);s.setProperty("--cb-cover-hi",`color-mix(in oklch, ${c}, white 9%)`);
    const m=/^#([0-9a-f]{6})$/i.exec(c);
    if(m){const [r,g,b]=[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)/255);const light=.2126*r+.7152*g+.0722*b>.45;thread(light?"oklch(0.24 0.02 80)":"oklch(0.86 0.02 80)");s.setProperty("--cb-press",light?"-1":"1")}
    else{thread(null);s.removeProperty("--cb-press")}
  }
  // the font colour: the pressed title's groove and the progress fill; pass nothing to go back to the cover-derived tones
  setFont(c){
    const s=this.host.style;this.font=c||"";
    if(c){s.setProperty("--cb-font",c);s.setProperty("--cb-thread",c)}
    else{s.removeProperty("--cb-font");this.setCover(this.cover)}
  }
  pressed(text){const n=document.createElement("span");n.className="cb-press";n.textContent=text;n.dataset.t=text;return n}
  prog(){
    if(this.progress==null)return null;
    const w=document.createElement("span");w.className="cb-prog";
    const t=document.createElement("span"),i=document.createElement("i");i.style.width=(Math.min(1,Math.max(0,this.progress))*100).toFixed(1)+"%";t.appendChild(i);w.appendChild(t);
    if(this.progressLabel){const l=document.createElement("small");l.textContent=this.progressLabel;w.appendChild(l)}
    return w;
  }
  // the four cover faces: the shut front and back covers, and the inside of each once the book is open
  face(kind){
    const c=document.createElement("div");c.className="cb-incover cb-"+kind;
    if(kind==="front"&&this.name)c.appendChild(this.pressed(this.name));
    if(kind==="in-front"){
      const card=document.createElement("div");card.className="cb-contents";
      if(this.name){const t=document.createElement("b");t.textContent=this.name;card.appendChild(t)}
      const dl=document.createElement("dl");
      this.inside.forEach(([k,v])=>{const dt=document.createElement("dt");dt.textContent=k;const dd=document.createElement("dd");dd.textContent=v;dl.append(dt,dd)});
      if(dl.childElementCount)card.appendChild(dl);
      const p=this.prog();if(p)card.appendChild(p);
      if(card.childElementCount)c.appendChild(card);
    }
    return c;
  }
  foot(leaf){
    const f=leaf.lastElementChild;f.replaceChildren();
    if(leaf.classList.contains("cb-cov"))return;
    const p=this.prog();if(p)f.appendChild(p);
  }
  paintFeet(){[this.leafL,this.leafR].forEach(l=>{if(!l.hidden)this.foot(l)})}
  paintCovers(){[this.leafL,this.leafR].forEach(l=>{if(!l.hidden&&l.dataset.cov)l.firstElementChild.replaceChildren(this.face(l.dataset.cov))})}
  fill(leaf,p){
    const grid=leaf.firstElementChild,cov=p<0||p>=this.total;
    leaf.classList.toggle("cb-cov",cov);leaf.classList.toggle("cb-lp",!cov&&p%2===1);leaf.dataset.p=cov?"":p+1;grid.innerHTML="";
    leaf.dataset.cov=cov?this.closed||(p<0?"in-front":"in-back"):"";
    if(cov)grid.appendChild(this.face(leaf.dataset.cov));
    else{
      const slice=p<this.pages?this.items.slice(p*this.per,p*this.per+this.per):[];
      slice.forEach((it,i)=>{const w=document.createElement("div");w.className="cb-pkt";w.appendChild(this.renderItem(it,p*this.per+i));grid.appendChild(w)});
      for(let i=slice.length;i<this.per;i++){const b=document.createElement("div");b.className="cb-pkt cb-empty";grid.appendChild(b)}
    }
    this.foot(leaf);
  }
  layout(closed){const b=this.book.classList;b.toggle("cb-spread",this.spread&&!closed);b.toggle("cb-closed",!!closed);b.toggle("cb-front",closed==="front");b.toggle("cb-back",closed==="back")}
  render(){
    const two=this.spread,h=this.host,s=h.style;
    s.setProperty("--cb-cols",this.cols);s.setProperty("--cb-rows",this.rows);
    if(!h.style.getPropertyValue("--cb-gap-fixed"))s.setProperty("--cb-gap",this.cols>=5?"8px":this.cols===4?"10px":"14px");
    h.classList.toggle("cb-two",two);h.classList.toggle("cb-fit",two&&this.fit);
    this.page=Math.min(Math.max(this.first,this.page),this.last);
    if(two&&this.page%2)this.page++;
    this.layout(this.closed);
    this.leafR.hidden=!two||!!this.closed;
    if(this.leafR.hidden)this.leafR.firstElementChild.replaceChildren();
    if(this.closed)this.fill(this.leafL,-1);else if(two){this.fill(this.leafL,this.page-1);this.fill(this.leafR,this.page)}else this.fill(this.leafL,this.page);
    if(this.pager)this.paintPager();
    this.onChange(this.state);
  }
  get state(){return {page:this.page,closed:this.closed,pages:this.pages,total:this.total,spread:this.spread,cols:this.cols,rows:this.rows}}
  // a sideways swipe (touch or pen, 60px, more across than down by half again) turns the page; the click that ends it is ignored
  armSwipe(){
    let x0=0,y0=0,id=null;
    this.book.addEventListener("pointerdown",e=>{this.swiped=false;if(e.pointerType==="mouse"||!e.isPrimary||e.target.closest("input,button,a"))return;x0=e.clientX;y0=e.clientY;id=e.pointerId;try{this.book.setPointerCapture(id)}catch(x){}},{passive:true});
    this.book.addEventListener("pointerup",e=>{
      if(e.pointerId!==id)return;id=null;
      const dx=e.clientX-x0,dy=e.clientY-y0;
      if(Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.5){this.swiped=true;this.turn(dx<0?1:-1)}
    },{passive:true});
    this.book.addEventListener("pointercancel",()=>{id=null},{passive:true});
  }
  mountPager(sizePicker){
    const p=document.createElement("div");p.className="cb-pager";
    const ic=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
    p.innerHTML=`<button type="button" data-go="first" aria-label="Front cover">${ic("M11 6l-6 6 6 6M18 6l-6 6 6 6")}</button><button type="button" data-go="prev" aria-label="Previous page">${ic("M15 5l-7 7 7 7")}</button><span class="cb-pgo"><input type="number" min="1" inputmode="numeric" aria-label="Page number"><span class="cb-tot"></span></span><button type="button" data-go="next" aria-label="Next page">${ic("M9 5l7 7-7 7")}</button><button type="button" data-go="last" aria-label="Back cover">${ic("M13 6l6 6-6 6M6 6l6 6-6 6")}</button>`;
    p.addEventListener("click",e=>{const g=e.target.closest("[data-go]");if(!g)return;({first:()=>this.close("front"),prev:()=>this.turn(-1),next:()=>this.turn(1),last:()=>this.close("back")})[g.dataset.go]()});
    const inp=p.querySelector("input");inp.addEventListener("change",()=>this.goTo((parseInt(inp.value,10)||1)-1));inp.addEventListener("keydown",e=>{if(e.key==="Enter")inp.blur()});
    if(sizePicker)p.appendChild(this.sizePicker());
    this.host.appendChild(p);this.pager=p;
  }
  paintPager(){
    const p=this.pager,inp=p.querySelector("input"),tot=p.querySelector(".cb-tot"),two=this.spread,c=this.closed;
    inp.max=this.pages;inp.hidden=!!c||this.page<0;
    if(c){inp.value="";tot.textContent=c==="front"?"Front cover":"Back cover"}
    else if(this.page<0){inp.value="";tot.textContent="Inside cover"}
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
