/* Atlas loading-animation engine — globe/stream particle field + workspace desk + live buffer.
   Adapted from the Atlas loading system. Exposes window.AtlasAnim.scan() / .mount(canvas).
   Canvases are declared in markup with data-field (particle field) or data-anim (desk|buffer)
   and self-start via IntersectionObserver. mount() is idempotent. */
(function () {
  var MONO = 'ui-monospace,"SF Mono",Menlo,monospace';
  var NAMES = ["Teva","Check Point","NICE","Elbit","ICL","Bank Leumi","Hapoalim","Mizrahi","Discount","Bezeq",
    "Azrieli","Shufersal","Strauss","Delek","Phoenix","Harel","Migdal","Clal","Tower","Nova","Camtek","Nayax",
    "Sapiens","Energean","Ormat","SolarEdge","Paz","Partner","Cellcom","Fattal","Melisron","Amot","Electra",
    "Shapir","Ashtrom","Tigbur","Qualitau","RGA","Nofar","Enlight","Maytronics","Plasson","NewMed","Isracard","Big","Inrom"];
  var FRAG = ["margins expanded","raising guidance","buyback authorised","FX headwind","record bookings","churn easing","ahead of consensus","capex flat"];
  var FILES = ["Q3-transcript.txt","earnings-deck.pdf","segment-model.xlsx","peer-set.csv","guidance.md","call-audio.m4a"];
  var INK = '24,22,15', ACC = '203,75,46';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  var PALETTES = {
    warm:['#5A5145','#6E6354','#867862','#9E8E73','#B6A485','#CDB899'],
    dark:['#2A2620','#3E382F','#544B3E','#6E6353','#897B66','#A28F74'],
    lite:['#FAF9F6','#EDE8DE','#DBD5C9','#C7C0B2','#B4AC9C','#A29A88'],
    loginWhite:['#33415E','#4F5478','#6E6480','#9A6E6E','#B5895F','#9C8B6E']
  };
  function hexToRgb(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)].join(',');}
  var spriteCache={};
  function sprites(key,arr){if(spriteCache[key])return spriteCache[key];
    var out=arr.map(function(c){var s=44,cv=document.createElement('canvas');cv.width=cv.height=s;var x=cv.getContext('2d');var rgb=hexToRgb(c);
      var g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'rgba('+rgb+',0.82)');g.addColorStop(.5,'rgba('+rgb+',0.32)');g.addColorStop(1,'rgba('+rgb+',0)');
      x.fillStyle=g;x.fillRect(0,0,s,s);return cv;});spriteCache[key]=out;return out;}
  function themeCfg(){return{bg:'rgba(255,255,255,0.34)',comp:'source-over',label:'42,38,32',tl:'96,86,72',tb:'160,150,134',cap:0.42,nl:'52,46,38',nb:'126,116,100',def:'dark'};}

  function mono(px,b){return (b?'600 ':'')+px+'px '+MONO;}

  /* ---------- particle field (globe / stream) ---------- */
  function Field(canvas,opt){
    var dpr=Math.min(window.devicePixelRatio||1,2);
    var cfg=themeCfg();
    if(opt.ink==='light'){ cfg=Object.assign({},cfg,{nl:'248,246,241',nb:'214,209,200',tl:'248,246,241',tb:'198,193,184',label:'248,246,241'}); }
    var palKey=opt.palette||(opt.ink==='light'?'lite':cfg.def);
    var pal=PALETTES[palKey]||PALETTES[cfg.def], SPR=sprites(palKey,pal);
    var labels=opt.labels==='1'||opt.labels===true;
    var W,H,nodes=[],edges=[],dust=[],t=0,active=[],lastSwap=0,running=false,raf;
    var MODE=opt.mode||'globe', COUNT=+opt.count||60, SPIN=+opt.spin||0.0018, CYCLE=+opt.cycle||12000,
        SCATTER=opt.scatter!=null?+opt.scatter:0.6, RFRAC=+opt.r||0.32, NEIGH=3, ACTIVE=4;
    var ctx=canvas.getContext('2d');

    function size(){
      var fill=canvas.getAttribute('data-fill')!=null;
      W=canvas.clientWidth;
      if(fill){ H=canvas.clientHeight||(+opt.h)||300; }
      else { H=opt.h?+opt.h:(canvas.clientHeight||44); canvas.style.height=opt.h?opt.h+'px':''; if(opt.h)H=+opt.h; if(!H||H<10)H=canvas.clientHeight||44; }
      canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
      buildNodes();makeDust();
    }
    function buildNodes(){
      var n=MODE==='stream'?Math.max(10,(W/44)|0):(+opt.nodes||NAMES.length); nodes=[];
      if(MODE==='globe'){
        for(var i=0;i<n;i++){var y=1-(i/(n-1))*2,r=Math.sqrt(1-y*y),th=i*2.399963;
          nodes.push({x:Math.cos(th)*r,y:y,z:Math.sin(th)*r,name:NAMES[i%NAMES.length],lit:0,sx:Math.random()*2-1,sy:Math.random()*2-1,sz:Math.random()*2-1,ph:Math.random()*6.28});}
        edges=[];for(var a=0;a<n;a++){var d=[];for(var j=0;j<n;j++)if(j!==a){var A=nodes[a],B=nodes[j];d.push([(A.x-B.x)*(A.x-B.x)+(A.y-B.y)*(A.y-B.y)+(A.z-B.z)*(A.z-B.z),j]);}d.sort(function(p,q){return p[0]-q[0];});for(var k=0;k<NEIGH;k++)edges.push([a,d[k][1]]);}
      }else{
        for(var s=0;s<n;s++) nodes.push({px:Math.random(),y:0.5+(Math.random()-0.5)*0.4,lit:0,name:(Math.random()<0.5?NAMES[(Math.random()*NAMES.length)|0]:FRAG[(Math.random()*FRAG.length)|0]),ph:Math.random()*6.28,vy:(Math.random()-0.5)*0.0003});
        edges=[];
      }
    }
    function makeDust(){dust=[];var k=MODE==='stream'?Math.round(COUNT*1.1):COUNT;for(var i=0;i<k;i++)dust.push(spawnDust(true));}
    function spawnDust(init){return{x:Math.random()*W,y:Math.random()*H,life:init?Math.random()*1.5:0,max:1+Math.random()*1.8,r:1.4+Math.random()*2.4,sp:0.5+Math.random()*0.8,ph:Math.random()*6.28};}
    function flow(x,y){var f=0.0045,s=0.00032;return Math.sin(x*f+t*s)*1.4+Math.cos(y*f*1.1-t*s*0.8)*1.4+Math.sin((x+y)*f*0.7+t*s*1.3)*0.9;}
    function swapActive(){ if(MODE!=='globe')return;
      active.forEach(function(i){nodes[i]&&(nodes[i].target=0);});
      var front=nodes.map(function(n,i){return[n._z||0,i];}).filter(function(p){return p[0]>0.1;}).sort(function(a,b){return b[0]-a[0];});
      var focus=front.length?front[(Math.random()*Math.min(8,front.length))|0][1]:(Math.random()*nodes.length|0);
      var near=edges.filter(function(e){return e[0]===focus;}).map(function(e){return e[1];});active=[focus].concat(near).slice(0,ACTIVE);active.forEach(function(i){nodes[i]&&(nodes[i].target=1);});}

    function frame(){
      t+=16;var cx=W/2,cy=H/2,R=Math.min(W,H)*RFRAC;var NS=Math.max(0.3,Math.min(1,Math.min(W,H)/160));
      ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,W,H);
      ctx.globalCompositeOperation=cfg.comp;var wind=MODE==='stream'?1.5:0.9;
      for(var di=0;di<dust.length;di++){var d=dust[di];var a2=MODE==='stream'?0.1:flow(d.x,d.y);
        d.x+=(MODE==='stream'?(0.5+d.sp):Math.cos(a2)*d.sp)*wind+0.12*wind; d.y+=(MODE==='stream'?Math.sin(t*0.001+d.ph)*0.2:Math.sin(a2)*d.sp*wind);
        d.life+=reduce?0:0.006;var a=Math.min(d.life,1)*Math.max(0,1-(d.life-d.max));a*=0.5+0.3*Math.sin(t*0.001*d.sp+d.ph);
        if(d.life>d.max+1||d.x>W+20||d.y>H+20||d.y<-20){Object.assign(d,spawnDust(false));if(MODE==='stream')d.x=-10;continue;}
        if(a<=0.01)continue;var idx=Math.min(SPR.length-1,Math.floor((d.x/W*0.6+(1-d.y/H)*0.4)*SPR.length));
        var rr=d.r*2.1*NS;ctx.globalAlpha=Math.min(cfg.cap,a*cfg.cap);ctx.drawImage(SPR[Math.max(0,idx)],d.x-rr,d.y-rr,rr*2,rr*2);}
      ctx.globalAlpha=1;

      if(MODE==='globe'){
        var p=((t%CYCLE)/CYCLE),disperse=reduce?0:Math.pow(0.5-0.5*Math.cos(p*6.2832),2.4);
        var ang=reduce?0.6:t*SPIN,ca=Math.cos(ang),sa=Math.sin(ang),ct=Math.cos(0.42),st=Math.sin(0.42);
        for(var ni=0;ni<nodes.length;ni++){var nd=nodes[ni];var ux=nd.x+nd.sx*SCATTER*disperse,uy=nd.y+nd.sy*SCATTER*disperse,uz=nd.z+nd.sz*SCATTER*disperse;
          var x=ux*ca+uz*sa,z=-ux*sa+uz*ca,y=uy;var y2=y*ct-z*st,z2=y*st+z*ct;nd._sx=cx+x*R;nd._sy=cy+y2*R;nd._z=z2;nd.lit+=((nd.target||0)-nd.lit)*0.08;}
        if(!reduce&&t-lastSwap>2600){lastSwap=t;swapActive();}
        ctx.globalCompositeOperation=cfg.comp;var meshA=Math.pow(1-disperse,1.6);
        for(var ei=0;ei<edges.length;ei++){var i=edges[ei][0],j=edges[ei][1];var A=nodes[i],B=nodes[j],fz=(A._z+B._z)/2;if(fz<-0.25)continue;
          var base=Math.max(0,(fz+0.4))*0.12,lit=Math.min(A.lit,1)*Math.min(B.lit,1),al=(base*0.55+lit*0.5)*meshA;if(al<0.01)continue;
          ctx.strokeStyle='rgba('+(lit>0.05?cfg.tl:cfg.tb)+','+al.toFixed(3)+')';ctx.lineWidth=0.5+lit*0.8;ctx.beginPath();ctx.moveTo(A._sx,A._sy);ctx.lineTo(B._sx,B._sy);ctx.stroke();}
        var order=nodes.map(function(n,i){return i;}).sort(function(q,w){return nodes[q]._z-nodes[w]._z;});
        for(var oi=0;oi<order.length;oi++){var nd2=nodes[order[oi]],depth=(nd2._z+1)/2,aa=0.18+depth*0.5,lit2=nd2.lit,r2=((1+depth*1.7)+lit2*1.6)*NS;
          ctx.globalCompositeOperation=cfg.comp;var g=ctx.createRadialGradient(nd2._sx,nd2._sy,0,nd2._sx,nd2._sy,r2*3);
          var c=lit2>0.05?cfg.nl:cfg.nb;g.addColorStop(0,'rgba('+c+','+Math.min(0.8,aa+lit2*0.4)+')');g.addColorStop(1,'rgba('+c+',0)');
          ctx.fillStyle=g;ctx.beginPath();ctx.arc(nd2._sx,nd2._sy,r2*3,0,6.28);ctx.fill();
          if(labels&&lit2>0.15&&nd2._z>0.05&&disperse<0.5){ctx.globalCompositeOperation='source-over';
            ctx.font=mono(12,true);
            ctx.fillStyle='rgba('+cfg.label+','+(lit2*(1-disperse*2)*Math.min(1,nd2._z*1.5)).toFixed(3)+')';ctx.textBaseline='middle';ctx.textAlign='left';
            ctx.fillRect(nd2._sx+r2+4,nd2._sy-0.5,6,1);ctx.fillText(nd2.name,nd2._sx+r2+14,nd2._sy);}}
      } else {
        if(!reduce&&t-lastSwap>2200){lastSwap=t;nodes.forEach(function(n){n.target=0;});var f=(Math.random()*nodes.length)|0;nodes[f].target=1;active=[f];}
        ctx.globalCompositeOperation=cfg.comp;nodes.sort(function(a,b){return a.px-b.px;});var prev=null;
        for(var si=0;si<nodes.length;si++){var nd3=nodes[si];nd3.px-=reduce?0:0.0009;if(nd3.px<-0.05){nd3.px=1.05;nd3.y=0.5+(Math.random()-0.5)*0.4;nd3.name=(Math.random()<0.5?NAMES[(Math.random()*NAMES.length)|0]:FRAG[(Math.random()*FRAG.length)|0]);}
          nd3.y+=nd3.vy;var sx=nd3.px*W,sy=nd3.y*H;nd3.lit+=((nd3.target||0)-nd3.lit)*0.07;var ef=Math.min(1,Math.min(nd3.px,1-nd3.px)*4);
          if(prev){var dx=sx-prev.sx,dy=sy-prev.sy,dd=Math.hypot(dx,dy);if(dd<W*0.14){var al2=(1-dd/(W*0.14))*0.16*ef;
            ctx.strokeStyle='rgba('+cfg.tb+','+al2.toFixed(3)+')';ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(prev.sx,prev.sy);ctx.lineTo(sx,sy);ctx.stroke();}}
          var lit3=nd3.lit,r3=2.0+lit3*2.2;var g2=ctx.createRadialGradient(sx,sy,0,sx,sy,r3*3);
          var c2=lit3>0.05?cfg.nl:cfg.nb;g2.addColorStop(0,'rgba('+c2+','+(0.5*ef+lit3*0.4).toFixed(3)+')');g2.addColorStop(1,'rgba('+c2+',0)');
          ctx.fillStyle=g2;ctx.beginPath();ctx.arc(sx,sy,r3*3,0,6.28);ctx.fill();
          if(labels&&lit3>0.2){ctx.globalCompositeOperation='source-over';ctx.font=mono(11,true);
            ctx.fillStyle='rgba('+cfg.label+','+(lit3*ef).toFixed(3)+')';ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillText(nd3.name,sx+8,sy);ctx.globalCompositeOperation=cfg.comp;}
          prev={sx:sx,sy:sy};}
      }
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      if(running&&!reduce)raf=requestAnimationFrame(frame);
    }
    function start(){if(running)return;running=true;if(MODE==='globe')swapActive();frame();}
    function stop(){running=false;cancelAnimationFrame(raf);}
    size();window.addEventListener('resize',size);
    if(reduce){running=true;frame();running=false;return;}
    start();
    new IntersectionObserver(function(es){es.forEach(function(e){e.isIntersecting?start():stop();});},{threshold:0.05}).observe(canvas);
  }

  /* ---------- shared setup/run for the drawn loaders ---------- */
  function setup(canvas){var dpr=Math.min(window.devicePixelRatio||1,2),ctx=canvas.getContext('2d');
    function size(){var fill=canvas.getAttribute('data-fill')!=null;var h=fill?(canvas.clientHeight||300):(+canvas.dataset.h||300);if(!fill)canvas.style.height=h+'px';var W=canvas.clientWidth,H=fill?(canvas.clientHeight||h):h;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);canvas._W=W;canvas._H=H;}
    size();window.addEventListener('resize',size);return ctx;}
  function run(canvas,step){var running=false,raf,t=0;
    function loop(){t+=16;step(t);if(running&&!reduce)raf=requestAnimationFrame(loop);}
    function start(){if(running)return;running=true;loop();}function stop(){running=false;cancelAnimationFrame(raf);}
    if(reduce){step(1000);return;}
    start();
    new IntersectionObserver(function(e){e.forEach(function(x){x.isIntersecting?start():stop();});},{threshold:0.05}).observe(canvas);}

  /* ---------- WORKSPACE — desk assembling ---------- */
  function desk(canvas){var ctx=setup(canvas);
    run(canvas,function(t){var W=canvas._W,H=canvas._H;ctx.clearRect(0,0,W,H);
      var pad=40,gap=14,top=64,bot=H-58;var cols=[0.46,0.27,0.27];var x=pad;
      var cyc=(t/900)%(cols.length+2);
      for(var i=0;i<cols.length;i++){var w=(W-pad*2-gap*(cols.length-1))*cols[i];
        var prog=Math.max(0,Math.min(1,cyc-i));var ap=prog;
        ctx.strokeStyle='rgba('+INK+','+(0.12*ap).toFixed(2)+')';ctx.lineWidth=1;
        var hh=(bot-top)*prog;
        ctx.strokeRect(x,top,w,Math.max(1,hh));
        if(prog>0.2){ctx.fillStyle='rgba('+INK+','+(0.05*ap).toFixed(2)+')';ctx.fillRect(x,top,w,22);
          ctx.font=mono(9.5);ctx.fillStyle='rgba('+INK+','+(0.45*ap).toFixed(2)+')';ctx.textBaseline='middle';ctx.textAlign='left';
          ctx.fillText(['TRANSCRIPT','SLIDES','REPORT'][i],x+9,top+11);}
        if(prog>0.5){var lines=(i===0?7:4);for(var l=0;l<lines;l++){var ly=top+38+l*16;if(ly>top+hh-8)break;
          var lp=Math.max(0,Math.min(1,(cyc-i-0.5)*2-l*0.15));
          ctx.strokeStyle='rgba('+INK+','+(0.14*lp*ap).toFixed(2)+')';ctx.beginPath();ctx.moveTo(x+9,ly);ctx.lineTo(x+9+(w-18)*(0.5+0.5*Math.sin(l*1.7))*lp,ly);ctx.stroke();}}
        x+=w+gap;
      }
      var sc=((t/900)%(cols.length+2))/(cols.length+2);
      var sx=pad+sc*(W-pad*2);ctx.strokeStyle='rgba('+INK+',0.10)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx,top-6);ctx.lineTo(sx,bot+6);ctx.stroke();
      ctx.font=mono(10);ctx.textAlign='left';ctx.textBaseline='middle';
      var fi=((t/1400)|0)%FILES.length;ctx.fillStyle='rgba('+INK+',0.4)';ctx.fillText('\u25B8 '+FILES[fi],pad,H-34);
    });
  }

  /* ---------- LIVE BUFFER — hosted-call sync delay ---------- */
  function buffer(canvas){var ctx=setup(canvas);
    var secs=+canvas.dataset.secs||285; var start=null; var fired=false;
    var INKC=canvas.getAttribute('data-ink')==='light'?'245,243,238':INK;
    run(canvas,function(t){var W=canvas._W,H=canvas._H,cx=W/2,cy=H*0.40;ctx.clearRect(0,0,W,H);
      if(start===null)start=t; var elapsed=(t-start)/1000; var left=Math.max(0,secs-elapsed);
      var live=left<=0;
      var R=Math.min(W,H)*0.24;
      // faint track
      ctx.strokeStyle='rgba('+INKC+',0.12)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,R,0,6.2832);ctx.stroke();
      if(!live){
        // indeterminate sweep arc
        var a0=(t*0.0022)%6.2832; var len=1.5;
        ctx.strokeStyle='rgba('+INKC+',0.62)';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.arc(cx,cy,R,a0,a0+len);ctx.stroke();
        // second faint sweep
        ctx.strokeStyle='rgba('+INKC+',0.2)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,R,a0+3.14,a0+3.14+len*0.6);ctx.stroke();
        ctx.lineCap='butt';
        // center estimate mm:ss
        var mm=String((left/60|0)).padStart(2,'0'),ss=String((left|0)%60).padStart(2,'0');
        ctx.textAlign='center';ctx.textBaseline='alphabetic';
        ctx.font=mono(9);ctx.fillStyle='rgba('+INKC+',0.5)';ctx.fillText('EST. LIVE IN',cx,cy-10);
        ctx.font=mono(30,true);ctx.fillStyle='rgba('+INKC+',0.9)';ctx.textBaseline='middle';ctx.fillText(mm+':'+ss,cx,cy+14);
      } else {
        var p=0.5+0.5*Math.sin(t*0.006);
        ctx.fillStyle='rgba('+ACC+','+(0.5+0.5*p).toFixed(2)+')';ctx.beginPath();ctx.arc(cx-34,cy,4,0,6.28);ctx.fill();
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=mono(22,true);ctx.fillStyle='rgba('+ACC+',0.95)';ctx.fillText('LIVE',cx+6,cy);
        if(!fired){fired=true;try{canvas.dispatchEvent(new CustomEvent('atlas-live',{bubbles:true}));}catch(e){}}
      }
    });
  }

  var DRAWN = { desk: desk, buffer: buffer };

  /* ---------- ORB — clean connecting-dots mark (icons / small loaders) ---------- */
  function bgLuminance(el){
    var node=el;
    while(node && node.nodeType===1){
      var bg=getComputedStyle(node).backgroundColor;
      var m=bg&&bg.match(/rgba?\(([^)]+)\)/);
      if(m){var p=m[1].split(',').map(function(x){return parseFloat(x);});var a=p[3]==null?1:p[3];if(a>0.06){return (0.2126*p[0]+0.7152*p[1]+0.0722*p[2])/255;}}
      node=node.parentElement;
    }
    return 1;
  }
  function Orb(canvas,opt){
    var size=+opt.size||24, accent=opt.accent==='1', SPIN=+opt.spin||0.0045;
    var dark = opt.dark!=null ? (opt.dark==='1') : (bgLuminance(canvas.parentElement||canvas) < 0.45);
    var dpr=Math.min(window.devicePixelRatio||1,3);
    canvas.style.width=size+'px';canvas.style.height=size+'px';
    canvas.width=size*dpr;canvas.height=size*dpr;
    var ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    var NODE=dark?'235,227,210':'24,22,15', ACCC='203,75,46';
    var n=24,nodes=[];
    for(var i=0;i<n;i++){var y=1-(i/(n-1))*2,r=Math.sqrt(1-y*y),th=i*2.399963;nodes.push({x:Math.cos(th)*r,y:y,z:Math.sin(th)*r,lit:0});}
    var edges=[];for(var a=0;a<n;a++){var d=[];for(var j=0;j<n;j++)if(j!==a){var A=nodes[a],B=nodes[j];d.push([(A.x-B.x)*(A.x-B.x)+(A.y-B.y)*(A.y-B.y)+(A.z-B.z)*(A.z-B.z),j]);}d.sort(function(p,q){return p[0]-q[0];});for(var k=0;k<3;k++)edges.push([a,d[k][1]]);}
    var t=0,active=[],last=0,running=false,raf;
    var cx=size/2,cy=size/2,R=size*0.40;
    function step(){
      t+=16;ctx.clearRect(0,0,size,size);
      var ang=reduce?0.6:t*SPIN,ca=Math.cos(ang),sa=Math.sin(ang),ct=Math.cos(0.42),st=Math.sin(0.42);
      for(var ni=0;ni<n;ni++){var nd=nodes[ni];var x=nd.x*ca+nd.z*sa,z=-nd.x*sa+nd.z*ca,y=nd.y;var y2=y*ct-z*st,z2=y*st+z*ct;nd._sx=cx+x*R;nd._sy=cy+y2*R;nd._z=z2;nd.lit+=((nd.target||0)-nd.lit)*0.1;}
      if(!reduce&&t-last>2800){last=t;active.forEach(function(i){nodes[i].target=0;});var f=(Math.random()*n)|0;var near=edges.filter(function(e){return e[0]===f;}).map(function(e){return e[1];});active=[f].concat(near).slice(0,3);active.forEach(function(i){nodes[i].target=1;});}
      for(var ei=0;ei<edges.length;ei++){var i2=edges[ei][0],j2=edges[ei][1];var A=nodes[i2],B=nodes[j2],fz=(A._z+B._z)/2;if(fz<-0.2)continue;var lit=Math.min(A.lit,1)*Math.min(B.lit,1),dep=Math.max(0,(fz+0.35))/1.35;var col=(accent&&lit>0.05)?ACCC:NODE;var al=lit>0.05?0.3+0.4*lit:0.05+dep*0.18;if(al<0.02)continue;ctx.strokeStyle='rgba('+col+','+al.toFixed(3)+')';ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(A._sx,A._sy);ctx.lineTo(B._sx,B._sy);ctx.stroke();}
      var order=nodes.map(function(nd,i){return i;}).sort(function(q,w){return nodes[q]._z-nodes[w]._z;});
      for(var oi=0;oi<order.length;oi++){var nd2=nodes[order[oi]],dep2=(nd2._z+1)/2,lit2=nd2.lit,r2=(0.7+dep2*0.9)+lit2*0.6;var col2=(accent&&lit2>0.05)?ACCC:NODE;ctx.fillStyle='rgba('+col2+','+(lit2>0.05?(0.7+0.3*lit2):(0.2+dep2*0.5)).toFixed(3)+')';ctx.beginPath();ctx.arc(nd2._sx,nd2._sy,r2,0,6.28);ctx.fill();}
      if(running&&!reduce)raf=requestAnimationFrame(step);
    }
    function start(){if(running)return;running=true;step();}
    function stop(){running=false;cancelAnimationFrame(raf);}
    if(reduce){step();return;}
    start();
    new IntersectionObserver(function(e){e.forEach(function(x){x.isIntersecting?start():stop();});},{threshold:0.05}).observe(canvas);
  }

  function mount(canvas){
    if(!canvas || canvas.__atlasInit) return;
    canvas.__atlasInit = true;
    if(canvas.hasAttribute('data-orb')){ Orb(canvas, canvas.dataset); return; }
    var anim = canvas.getAttribute('data-anim');
    if(anim && DRAWN[anim]){ DRAWN[anim](canvas); return; }
    Field(canvas, canvas.dataset);
  }
  function scan(root){
    (root||document).querySelectorAll('[data-field],[data-anim],[data-orb]').forEach(mount);
  }
  window.AtlasAnim = { mount: mount, scan: scan };
})();
