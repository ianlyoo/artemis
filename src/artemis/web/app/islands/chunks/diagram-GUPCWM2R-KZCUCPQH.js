import{a as z}from"./chunk-TWXUB526.js";import{a as E}from"./chunk-KNTHVI2T.js";import"./chunk-JCINT64N.js";import"./chunk-SXBVKPXM.js";import"./chunk-GFGBRFWS.js";import"./chunk-2C46IGJY.js";import"./chunk-MXDFUBNI.js";import"./chunk-KTO2RJQ7.js";import"./chunk-E54O2UEC.js";import"./chunk-SWUNJFWI.js";import"./chunk-TCCLND47.js";import{a as P}from"./chunk-VNELW4TC.js";import{C as m}from"./chunk-TXFOYAGW.js";import"./chunk-ZIZPQYBP.js";import"./chunk-GB3GI62A.js";import{C as v,O as x,S as y,T as $,U as B,V as C,W as S,X as D,Y as T,h,j as u,u as w}from"./chunk-H2KUPQPG.js";import"./chunk-4O3RKPKA.js";import"./chunk-C4IHDN5B.js";import"./chunk-SGBOX2D7.js";var N=w.packet,F=class{constructor(){this.packet=[],this.setAccTitle=$,this.getAccTitle=B,this.setDiagramTitle=D,this.getDiagramTitle=T,this.getAccDescription=S,this.setAccDescription=C}static{h(this,"PacketDB")}getConfig(){let t=m({...N,...v().packet});return t.showBits&&(t.paddingY+=10),t}getPacket(){return this.packet}pushWord(t){t.length>0&&this.packet.push(t)}clear(){y(),this.packet=[]}},L=1e4,M=h((t,e)=>{z(t,e);let r=-1,o=[],n=1,{bitsPerRow:l}=e.getConfig();for(let{start:a,end:s,bits:d,label:c}of t.blocks){if(a!==void 0&&s!==void 0&&s<a)throw new Error(`Packet block ${a} - ${s} is invalid. End must be greater than start.`);if(a??=r+1,a!==r+1)throw new Error(`Packet block ${a} - ${s??a} is not contiguous. It should start from ${r+1}.`);if(d===0)throw new Error(`Packet block ${a} is invalid. Cannot have a zero bit field.`);for(s??=a+(d??1)-1,d??=s-a+1,r=s,u.debug(`Packet block ${a} - ${r} with label ${c}`);o.length<=l+1&&e.getPacket().length<L;){let[p,i]=Y({start:a,end:s,bits:d,label:c},n,l);if(o.push(p),p.end+1===n*l&&(e.pushWord(o),o=[],n++),!i)break;({start:a,end:s,bits:d,label:c}=i)}}e.pushWord(o)},"populate"),Y=h((t,e,r)=>{if(t.start===void 0)throw new Error("start should have been set during first phase");if(t.end===void 0)throw new Error("end should have been set during first phase");if(t.start>t.end)throw new Error(`Block start ${t.start} is greater than block end ${t.end}.`);if(t.end+1<=e*r)return[t,void 0];let o=e*r-1,n=e*r;return[{start:t.start,end:o,label:t.label,bits:o-t.start},{start:n,end:t.end,label:t.label,bits:t.end-n}]},"getNextFittingBlock"),A={parser:{yy:void 0},parse:h(async t=>{let e=await E("packet",t),r=A.parser?.yy;if(!(r instanceof F))throw new Error("parser.parser?.yy was not a PacketDB. This is due to a bug within Mermaid, please report this issue at https://github.com/mermaid-js/mermaid/issues.");u.debug(e),M(e,r)},"parse")},I=h((t,e,r,o)=>{let n=o.db,l=n.getConfig(),{rowHeight:a,paddingY:s,bitWidth:d,bitsPerRow:c}=l,p=n.getPacket(),i=n.getDiagramTitle(),f=a+s,g=f*(p.length+1)-(i?0:a),k=d*c+2,b=P(e);b.attr("viewbox",`0 0 ${k} ${g}`),x(b,g,k,l.useMaxWidth);for(let[W,_]of p.entries())O(b,_,W,l);b.append("text").text(i).attr("x",k/2).attr("y",g-f/2).attr("dominant-baseline","middle").attr("text-anchor","middle").attr("class","packetTitle")},"draw"),O=h((t,e,r,{rowHeight:o,paddingX:n,paddingY:l,bitWidth:a,bitsPerRow:s,showBits:d})=>{let c=t.append("g"),p=r*(o+l)+l;for(let i of e){let f=i.start%s*a+1,g=(i.end-i.start+1)*a-n;if(c.append("rect").attr("x",f).attr("y",p).attr("width",g).attr("height",o).attr("class","packetBlock"),c.append("text").attr("x",f+g/2).attr("y",p+o/2).attr("class","packetLabel").attr("dominant-baseline","middle").attr("text-anchor","middle").text(i.label),!d)continue;let k=i.end===i.start,b=p-2;c.append("text").attr("x",f+(k?g/2:0)).attr("y",b).attr("class","packetByte start").attr("dominant-baseline","auto").attr("text-anchor",k?"middle":"start").text(i.start),k||c.append("text").attr("x",f+g).attr("y",b).attr("class","packetByte end").attr("dominant-baseline","auto").attr("text-anchor","end").text(i.end)}},"drawWord"),j={draw:I},G={byteFontSize:"10px",startByteColor:"black",endByteColor:"black",labelColor:"black",labelFontSize:"12px",titleColor:"black",titleFontSize:"14px",blockStrokeColor:"black",blockStrokeWidth:"1",blockFillColor:"#efefef"},H=h(({packet:t}={})=>{let e=m(G,t);return`
	.packetByte {
		font-size: ${e.byteFontSize};
	}
	.packetByte.start {
		fill: ${e.startByteColor};
	}
	.packetByte.end {
		fill: ${e.endByteColor};
	}
	.packetLabel {
		fill: ${e.labelColor};
		font-size: ${e.labelFontSize};
	}
	.packetTitle {
		fill: ${e.titleColor};
		font-size: ${e.titleFontSize};
	}
	.packetBlock {
		stroke: ${e.blockStrokeColor};
		stroke-width: ${e.blockStrokeWidth};
		fill: ${e.blockFillColor};
	}
	`},"styles"),J={parser:A,get db(){return new F},renderer:j,styles:H};export{J as diagram};
