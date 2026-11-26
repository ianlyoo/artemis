import{a as J}from"./chunk-TWXUB526.js";import{a as K}from"./chunk-KNTHVI2T.js";import"./chunk-JCINT64N.js";import"./chunk-SXBVKPXM.js";import{w as V}from"./chunk-FVJ7YYCK.js";import"./chunk-GFGBRFWS.js";import"./chunk-2C46IGJY.js";import"./chunk-MXDFUBNI.js";import"./chunk-KTO2RJQ7.js";import"./chunk-E54O2UEC.js";import"./chunk-SWUNJFWI.js";import"./chunk-TCCLND47.js";import{a as H}from"./chunk-VNELW4TC.js";import{B as j,C as q}from"./chunk-TXFOYAGW.js";import"./chunk-ZIZPQYBP.js";import{a as C,d as Z}from"./chunk-GB3GI62A.js";import{O as W,S as M,T as P,U as R,V as I,W as L,X as N,Y as B,Z as U,h as o,j as g,u as O}from"./chunk-H2KUPQPG.js";import"./chunk-4O3RKPKA.js";import"./chunk-C4IHDN5B.js";import"./chunk-SGBOX2D7.js";var Q=O.pie,D={sections:new Map,showData:!1,config:Q},f=D.sections,y=D.showData,ne=structuredClone(Q),se=o(()=>structuredClone(ne),"getConfig"),ce=o(()=>{f=new Map,y=D.showData,M()},"clear"),de=o(({label:e,value:a})=>{if(a<0)throw new Error(`"${e}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);f.has(e)||(f.set(e,a),g.debug(`added new section: ${e}, with value: ${a}`))},"addSection"),pe=o(()=>f,"getSections"),ge=o(e=>{y=e},"setShowData"),fe=o(()=>y,"getShowData"),X={getConfig:se,clear:ce,setDiagramTitle:N,getDiagramTitle:B,setAccTitle:P,getAccTitle:R,setAccDescription:I,getAccDescription:L,addSection:de,getSections:pe,setShowData:ge,getShowData:fe},ue=o((e,a)=>{J(e,a),a.setShowData(e.showData),e.sections.map(a.addSection)},"populateDb"),he={parse:o(async e=>{let a=await K("pie",e);g.debug(a),ue(a,X)},"parse")},me=o(e=>`
  .pieCircle{
    stroke: ${e.pieStrokeColor};
    stroke-width : ${e.pieStrokeWidth};
    opacity : ${e.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${e.pieOuterStrokeColor};
    stroke-width: ${e.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${e.pieTitleTextSize};
    fill: ${e.pieTitleTextColor};
    font-family: ${e.fontFamily};
  }
  .slice {
    font-family: ${e.fontFamily};
    fill: ${e.pieSectionTextColor};
    font-size:${e.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${e.pieLegendTextColor};
    font-family: ${e.fontFamily};
    font-size: ${e.pieLegendTextSize};
  }
`,"getStyles"),ve=me,Se=o(e=>{let a=[...e.values()].reduce((r,l)=>r+l,0),$=[...e.entries()].map(([r,l])=>({label:r,value:l})).filter(r=>r.value/a*100>=1).sort((r,l)=>l.value-r.value);return Z().value(r=>r.value)($)},"createPieArcs"),xe=o((e,a,$,T)=>{g.debug(`rendering pie chart
`+e);let r=T.db,l=U(),A=q(r.getConfig(),l.pie),b=40,n=18,d=4,s=450,u=s,h=H(a),c=h.append("g");c.attr("transform","translate("+u/2+","+s/2+")");let{themeVariables:i}=l,[E]=j(i.pieOuterStrokeWidth);E??=2;let _=A.textPosition,p=Math.min(u,s)/2-b,Y=C().innerRadius(0).outerRadius(p),ee=C().innerRadius(p*_).outerRadius(p*_);c.append("circle").attr("cx",0).attr("cy",0).attr("r",p+E/2).attr("class","pieOuterCircle");let m=r.getSections(),te=Se(m),ae=[i.pie1,i.pie2,i.pie3,i.pie4,i.pie5,i.pie6,i.pie7,i.pie8,i.pie9,i.pie10,i.pie11,i.pie12],v=0;m.forEach(t=>{v+=t});let k=te.filter(t=>(t.data.value/v*100).toFixed(0)!=="0"),S=V(ae);c.selectAll("mySlices").data(k).enter().append("path").attr("d",Y).attr("fill",t=>S(t.data.label)).attr("class","pieCircle"),c.selectAll("mySlices").data(k).enter().append("text").text(t=>(t.data.value/v*100).toFixed(0)+"%").attr("transform",t=>"translate("+ee.centroid(t)+")").style("text-anchor","middle").attr("class","slice"),c.append("text").text(r.getDiagramTitle()).attr("x",0).attr("y",-(s-50)/2).attr("class","pieTitleText");let z=[...m.entries()].map(([t,w])=>({label:t,value:w})),x=c.selectAll(".legend").data(z).enter().append("g").attr("class","legend").attr("transform",(t,w)=>{let G=n+d,ie=G*z.length/2,oe=12*n,le=w*G-ie;return"translate("+oe+","+le+")"});x.append("rect").attr("width",n).attr("height",n).style("fill",t=>S(t.label)).style("stroke",t=>S(t.label)),x.append("text").attr("x",n+d).attr("y",n-d).text(t=>r.getShowData()?`${t.label} [${t.value}]`:t.label);let re=Math.max(...x.selectAll("text").nodes().map(t=>t?.getBoundingClientRect().width??0)),F=u+b+n+d+re;h.attr("viewBox",`0 0 ${F} ${s}`),W(h,s,F,A.useMaxWidth)},"draw"),we={draw:xe},be={parser:he,db:X,renderer:we,styles:ve};export{be as diagram};
