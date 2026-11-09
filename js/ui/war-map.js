const ns='http://www.w3.org/2000/svg';
export function createWarMapOverlay(svg){
  let groups=[],lastView='';
  function element(name,attrs){const e=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
  function update(data){
    if(data.wars){svg.replaceChildren();groups=[];svg.toggleAttribute('hidden',!data.wars.length);
      for(const war of data.wars){const g=element('g',{'class':'war-front-blink','data-war':war.id}),p=element('path',{d:war.path,fill:'#ef43591a',stroke:'#ff5369','stroke-width':'1.6','vector-effect':'non-scaling-stroke'});g.append(p);svg.append(g);let arrow=null;
        if(war.arrow){arrow=element('path',{'class':'war-attack-arrow','data-war':war.id,fill:'none',stroke:'#ffd19c','stroke-width':'3'});svg.append(arrow);}
        groups.push({g,arrow,points:war.arrow});
      }lastView='';
    }
    if(!data.view)return;const {x,y,k,width,height,zoom}=data.view;if(!(width>0&&height>0&&Number.isFinite(zoom)))return;const key=[x,y,k,width,height].join(':');if(key===lastView)return;lastView=key;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    for(const item of groups){item.g.setAttribute('transform',`translate(${x} ${y}) scale(${k})`);item.g.style.display=zoom>=3?'':'none';if(item.arrow){const [[ax,ay],[bx,by]]=item.points,a=[ax*k+x,ay*k+y],b=[bx*k+x,by*k+y],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1){item.arrow.setAttribute('d','');continue;}const ux=dx/length,uy=dy/length;item.arrow.setAttribute('d',`M${a[0]},${a[1]} L${b[0]},${b[1]} M${b[0]-ux*11-uy*6},${b[1]-uy*11+ux*6} L${b[0]},${b[1]} L${b[0]-ux*11+uy*6},${b[1]-uy*11-ux*6}`);}}
  }
  return {update};
}
