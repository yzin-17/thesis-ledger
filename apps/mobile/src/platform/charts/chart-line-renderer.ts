/** 在同一逻辑曲线内按缺口切分绘制，保持颜色和数值语义一致。 */
export const chartLineRenderer = `
  const desired=[];
  p.data.lines.forEach(line=>{
    const breaks=new Set(line.breakBefore||[]);let points=[];
    const flush=()=>{if(points.length){desired.push({...line,values:points});points=[];}};
    line.values.forEach(point=>{if(breaks.has(point.time))flush();points.push(point);});flush();
  });
  while(lines.length>desired.length){chart.removeSeries(lines.pop());lineKinds.pop();}
  desired.forEach((line,index)=>{
    const kind=(line.kind||'line')+':'+(line.pane||0);
    if(lines[index]&&lineKinds[index]!==kind){chart.removeSeries(lines[index]);lines[index]=null;}
    if(!lines[index]){lines[index]=chart.addSeries(line.kind==='histogram'?LightweightCharts.HistogramSeries:LightweightCharts.LineSeries,{lineWidth:line.color?2:1,priceLineVisible:false,lastValueVisible:false},line.pane||0);lineKinds[index]=kind;}
    lines[index].applyOptions({color:line.color||p.colors.line,...(line.kind==='histogram'?{}:{lineStyle:line.style||0,pointMarkersVisible:line.values.length===1}),
      priceFormat:p.data.valueFormat==='percent'?{type:'custom',formatter:value=>value.toFixed(2)+'%'}:{type:'price',precision:2,minMove:0.01}});
    lines[index].setData(line.kind==='histogram'?line.values.map(point=>({...point,color:point.value>=0?p.colors.up:p.colors.down})):line.values);
  });
`;
