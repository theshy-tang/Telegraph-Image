/* Viewport row calculations shared by Studio and its regression tests. */
(function(root){
 function range({count,columns,height,gap,top,viewport,overscan=2}){
  count=Math.max(0,Math.floor(count));columns=Math.max(1,Math.floor(columns));
  if(!count)return {start:0,end:0,before:0,after:0,rows:0,totalHeight:0};
  const rows=Math.ceil(count/columns),stride=height+gap,first=Math.max(0,Math.min(rows-1,Math.floor(-top/stride)));
  const startRow=Math.max(0,first-overscan),endRow=Math.min(rows,Math.max(first+1,Math.ceil((viewport-top)/stride)+overscan));
  return {start:startRow*columns,end:Math.min(count,endRow*columns),before:startRow?startRow*stride-gap:0,after:endRow<rows?(rows-endRow)*stride-gap:0,rows,totalHeight:rows*height+(rows-1)*gap};
 }
 function target(index,key,columns,count){
  const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns};
  if(key==='Home')return 0;if(key==='End')return count-1;
  return Object.hasOwn(delta,key)?Math.max(0,Math.min(count-1,index+delta[key])):null;
 }
 const api={range,target};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudioGrid=api;
})(typeof globalThis!=='undefined'?globalThis:this);
