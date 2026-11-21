/* Ordered, aspect-preserving rows. The unfinished last row is never enlarged. */
(function(root){
 function layout(ratios,width,target=200,gap=8){
  width=Math.max(1,Number(width)||1);target=Math.max(1,Number(target)||200);gap=Math.max(0,Number(gap)||0);
  const boxes=[],rows=[];let top=0,start=0;
  const ratio=i=>Number.isFinite(ratios[i])&&ratios[i]>0?ratios[i]:1;
  while(start<ratios.length){
   let end=start,sum=0;
   while(end<ratios.length){
    const next=sum+ratio(end),height=(width-gap*(end-start))/next;
    if(end>start&&height<target){const previous=(width-gap*(end-start-1))/sum;if(Math.abs(previous-target)<Math.abs(height-target))break;}
    sum=next;end++;if(height<=target)break;
   }
   // Extreme panoramas retain their true ratio; no artificial cropping/clamping.
   const fullHeight=Math.max(0.01,(width-gap*(end-start-1))/sum);
   const height=end===ratios.length?Math.min(target,fullHeight):fullHeight;
   let left=0;const row=rows.length;
   for(let i=start;i<end;i++){const w=ratio(i)*height;boxes.push({left,top,width:w,height,row});left+=w+gap;}
   rows.push({start,end,top,height});top+=height+gap;start=end;
  }
  return {boxes,rows,height:rows.length?top-gap:0};
 }
 function visible(geometry,top,viewport,overscan=2){
  const rows=geometry.rows;if(!rows.length)return {start:0,end:0};
  const from=Math.max(0,-top),to=Math.max(from,viewport-top);let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].top+rows[mid].height<from)lo=mid+1;else hi=mid;}
  const first=Math.max(0,Math.min(rows.length-1,lo)-overscan);lo=first;
  while(lo<rows.length&&rows[lo].top<to)lo++;
  return {start:rows[first].start,end:rows[Math.min(rows.length-1,lo+overscan)].end};
 }
 function target(index,key,geometry){
  const count=geometry.boxes.length;if(!count)return null;
  if(key==='Home')return 0;if(key==='End')return count-1;
  if(key==='ArrowLeft')return Math.max(0,index-1);if(key==='ArrowRight')return Math.min(count-1,index+1);
  if(key!=='ArrowUp'&&key!=='ArrowDown')return null;
  const box=geometry.boxes[index],r=geometry.rows[box.row+(key==='ArrowUp'?-1:1)];if(!r)return index;
  const center=box.left+box.width/2;let best=r.start,distance=Infinity;
  for(let i=r.start;i<r.end;i++){const b=geometry.boxes[i],d=Math.abs(b.left+b.width/2-center);if(d<distance){best=i;distance=d;}}
  return best;
 }
 const api={layout,visible,target};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioJustified=api;
})(typeof globalThis!=='undefined'?globalThis:this);
