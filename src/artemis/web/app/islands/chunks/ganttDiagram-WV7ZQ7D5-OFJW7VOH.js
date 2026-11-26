import{a as ge,b as pe,f as ve,i as It,j as Lt,k as Ft,l as Yt,m as Wt,n as be,o as Te,p as xe,q as we,r as _e,s as De,t as Se,u as Vt,v as Ot,y as Ce,z as Ee}from"./chunk-FVJ7YYCK.js";import{D as Me}from"./chunk-TXFOYAGW.js";import{a as Ke}from"./chunk-ZIZPQYBP.js";import"./chunk-GB3GI62A.js";import{N as ce,O as le,S as ue,T as de,U as fe,V as he,W as ke,X as me,Y as ye,Z as nt,a as oe,ea as mt,h as l,j as kt}from"./chunk-H2KUPQPG.js";import"./chunk-C4IHDN5B.js";import{a as At,d as dt}from"./chunk-SGBOX2D7.js";var Ye=At((Rt,Nt)=>{(function(t,e){typeof Rt=="object"&&typeof Nt<"u"?Nt.exports=e():typeof define=="function"&&define.amd?define(e):(t=typeof globalThis<"u"?globalThis:t||self).dayjs_plugin_isoWeek=e()})(Rt,(function(){"use strict";var t="day";return function(e,a,s){var i=function(C){return C.add(4-C.isoWeekday(),t)},u=a.prototype;u.isoWeekYear=function(){return i(this).year()},u.isoWeek=function(C){if(!this.$utils().u(C))return this.add(7*(C-this.isoWeek()),t);var x,E,S,W,M=i(this),_=(x=this.isoWeekYear(),E=this.$u,S=(E?s.utc:s)().year(x).startOf("year"),W=4-S.isoWeekday(),S.isoWeekday()>4&&(W+=7),S.add(W,t));return M.diff(_,"week")+1},u.isoWeekday=function(C){return this.$utils().u(C)?this.day()||7:this.day(this.day()%7?C:C-7)};var f=u.startOf;u.startOf=function(C,x){var E=this.$utils(),S=!!E.u(x)||x;return E.p(C)==="isoweek"?S?this.date(this.date()-(this.isoWeekday()-1)).startOf("day"):this.date(this.date()-1-(this.isoWeekday()-1)+7).endOf("day"):f.bind(this)(C,x)}}}))});var We=At((Bt,Ht)=>{(function(t,e){typeof Bt=="object"&&typeof Ht<"u"?Ht.exports=e():typeof define=="function"&&define.amd?define(e):(t=typeof globalThis<"u"?globalThis:t||self).dayjs_plugin_customParseFormat=e()})(Bt,(function(){"use strict";var t={LTS:"h:mm:ss A",LT:"h:mm A",L:"MM/DD/YYYY",LL:"MMMM D, YYYY",LLL:"MMMM D, YYYY h:mm A",LLLL:"dddd, MMMM D, YYYY h:mm A"},e=/(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g,a=/\d/,s=/\d\d/,i=/\d\d?/,u=/\d*[^-_:/,()\s\d]+/,f={},C=function(v){return(v=+v)+(v>68?1900:2e3)},x=function(v){return function(y){this[v]=+y}},E=[/[+-]\d\d:?(\d\d)?|Z/,function(v){(this.zone||(this.zone={})).offset=(function(y){if(!y||y==="Z")return 0;var I=y.match(/([+-]|\d\d)/g),L=60*I[1]+(+I[2]||0);return L===0?0:I[0]==="+"?-L:L})(v)}],S=function(v){var y=f[v];return y&&(y.indexOf?y:y.s.concat(y.f))},W=function(v,y){var I,L=f.meridiem;if(L){for(var R=1;R<=24;R+=1)if(v.indexOf(L(R,0,y))>-1){I=R>12;break}}else I=v===(y?"pm":"PM");return I},M={A:[u,function(v){this.afternoon=W(v,!1)}],a:[u,function(v){this.afternoon=W(v,!0)}],Q:[a,function(v){this.month=3*(v-1)+1}],S:[a,function(v){this.milliseconds=100*+v}],SS:[s,function(v){this.milliseconds=10*+v}],SSS:[/\d{3}/,function(v){this.milliseconds=+v}],s:[i,x("seconds")],ss:[i,x("seconds")],m:[i,x("minutes")],mm:[i,x("minutes")],H:[i,x("hours")],h:[i,x("hours")],HH:[i,x("hours")],hh:[i,x("hours")],D:[i,x("day")],DD:[s,x("day")],Do:[u,function(v){var y=f.ordinal,I=v.match(/\d+/);if(this.day=I[0],y)for(var L=1;L<=31;L+=1)y(L).replace(/\[|\]/g,"")===v&&(this.day=L)}],w:[i,x("week")],ww:[s,x("week")],M:[i,x("month")],MM:[s,x("month")],MMM:[u,function(v){var y=S("months"),I=(S("monthsShort")||y.map((function(L){return L.slice(0,3)}))).indexOf(v)+1;if(I<1)throw new Error;this.month=I%12||I}],MMMM:[u,function(v){var y=S("months").indexOf(v)+1;if(y<1)throw new Error;this.month=y%12||y}],Y:[/[+-]?\d+/,x("year")],YY:[s,function(v){this.year=C(v)}],YYYY:[/\d{4}/,x("year")],Z:E,ZZ:E};function _(v){var y,I;y=v,I=f&&f.formats;for(var L=(v=y.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g,(function(p,w,T){var b=T&&T.toUpperCase();return w||I[T]||t[T]||I[b].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g,(function(k,D,c){return D||c.slice(1)}))}))).match(e),R=L.length,N=0;N<R;N+=1){var X=L[N],B=M[X],P=B&&B[0],O=B&&B[1];L[N]=O?{regex:P,parser:O}:X.replace(/^\[|\]$/g,"")}return function(p){for(var w={},T=0,b=0;T<R;T+=1){var k=L[T];if(typeof k=="string")b+=k.length;else{var D=k.regex,c=k.parser,h=p.slice(b),m=D.exec(h)[0];c.call(w,m),p=p.replace(m,"")}}return(function(d){var g=d.afternoon;if(g!==void 0){var r=d.hours;g?r<12&&(d.hours+=12):r===12&&(d.hours=0),delete d.afternoon}})(w),w}}return function(v,y,I){I.p.customParseFormat=!0,v&&v.parseTwoDigitYear&&(C=v.parseTwoDigitYear);var L=y.prototype,R=L.parse;L.parse=function(N){var X=N.date,B=N.utc,P=N.args;this.$u=B;var O=P[1];if(typeof O=="string"){var p=P[2]===!0,w=P[3]===!0,T=p||w,b=P[2];w&&(b=P[2]),f=this.$locale(),!p&&b&&(f=I.Ls[b]),this.$d=(function(h,m,d,g){try{if(["x","X"].indexOf(m)>-1)return new Date((m==="X"?1e3:1)*h);var r=_(m)(h),o=r.year,n=r.month,Y=r.day,A=r.hours,F=r.minutes,G=r.seconds,V=r.milliseconds,st=r.zone,z=r.week,Q=new Date,et=Y||(o||n?1:Q.getDate()),rt=o||Q.getFullYear(),ot=0;o&&!n||(ot=n>0?n-1:Q.getMonth());var ct,lt=A||0,H=F||0,it=G||0,$=V||0;return st?new Date(Date.UTC(rt,ot,et,lt,H,it,$+60*st.offset*1e3)):d?new Date(Date.UTC(rt,ot,et,lt,H,it,$)):(ct=new Date(rt,ot,et,lt,H,it,$),z&&(ct=g(ct).week(z).toDate()),ct)}catch{return new Date("")}})(X,O,B,I),this.init(),b&&b!==!0&&(this.$L=this.locale(b).$L),T&&X!=this.format(O)&&(this.$d=new Date("")),f={}}else if(O instanceof Array)for(var k=O.length,D=1;D<=k;D+=1){P[1]=O[D-1];var c=I.apply(this,P);if(c.isValid()){this.$d=c.$d,this.$L=c.$L,this.init();break}D===k&&(this.$d=new Date(""))}else R.call(this,N)}}}))});var Ve=At((jt,Gt)=>{(function(t,e){typeof jt=="object"&&typeof Gt<"u"?Gt.exports=e():typeof define=="function"&&define.amd?define(e):(t=typeof globalThis<"u"?globalThis:t||self).dayjs_plugin_advancedFormat=e()})(jt,(function(){"use strict";return function(t,e){var a=e.prototype,s=a.format;a.format=function(i){var u=this,f=this.$locale();if(!this.isValid())return s.bind(this)(i);var C=this.$utils(),x=(i||"YYYY-MM-DDTHH:mm:ssZ").replace(/\[([^\]]+)]|Q|wo|ww|w|WW|W|zzz|z|gggg|GGGG|Do|X|x|k{1,2}|S/g,(function(E){switch(E){case"Q":return Math.ceil((u.$M+1)/3);case"Do":return f.ordinal(u.$D);case"gggg":return u.weekYear();case"GGGG":return u.isoWeekYear();case"wo":return f.ordinal(u.week(),"W");case"w":case"ww":return C.s(u.week(),E==="w"?1:2,"0");case"W":case"WW":return C.s(u.isoWeek(),E==="W"?1:2,"0");case"k":case"kk":return C.s(String(u.$H===0?24:u.$H),E==="k"?1:2,"0");case"X":return Math.floor(u.$d.getTime()/1e3);case"x":return u.$d.getTime();case"z":return"["+u.offsetName()+"]";case"zzz":return"["+u.offsetName("long")+"]";default:return E}}));return s.bind(this)(x)}}}))});function Je(t){return t}var xt=1,zt=2,Pt=3,Tt=4,Ae=1e-6;function tr(t){return"translate("+t+",0)"}function er(t){return"translate(0,"+t+")"}function rr(t){return e=>+t(e)}function ir(t,e){return e=Math.max(0,t.bandwidth()-e*2)/2,t.round()&&(e=Math.round(e)),a=>+t(a)+e}function nr(){return!this.__axis}function Ie(t,e){var a=[],s=null,i=null,u=6,f=6,C=3,x=typeof window<"u"&&window.devicePixelRatio>1?0:.5,E=t===xt||t===Tt?-1:1,S=t===Tt||t===zt?"x":"y",W=t===xt||t===Pt?tr:er;function M(_){var v=s??(e.ticks?e.ticks.apply(e,a):e.domain()),y=i??(e.tickFormat?e.tickFormat.apply(e,a):Je),I=Math.max(u,0)+C,L=e.range(),R=+L[0]+x,N=+L[L.length-1]+x,X=(e.bandwidth?ir:rr)(e.copy(),x),B=_.selection?_.selection():_,P=B.selectAll(".domain").data([null]),O=B.selectAll(".tick").data(v,e).order(),p=O.exit(),w=O.enter().append("g").attr("class","tick"),T=O.select("line"),b=O.select("text");P=P.merge(P.enter().insert("path",".tick").attr("class","domain").attr("stroke","currentColor")),O=O.merge(w),T=T.merge(w.append("line").attr("stroke","currentColor").attr(S+"2",E*u)),b=b.merge(w.append("text").attr("fill","currentColor").attr(S,E*I).attr("dy",t===xt?"0em":t===Pt?"0.71em":"0.32em")),_!==B&&(P=P.transition(_),O=O.transition(_),T=T.transition(_),b=b.transition(_),p=p.transition(_).attr("opacity",Ae).attr("transform",function(k){return isFinite(k=X(k))?W(k+x):this.getAttribute("transform")}),w.attr("opacity",Ae).attr("transform",function(k){var D=this.parentNode.__axis;return W((D&&isFinite(D=D(k))?D:X(k))+x)})),p.remove(),P.attr("d",t===Tt||t===zt?f?"M"+E*f+","+R+"H"+x+"V"+N+"H"+E*f:"M"+x+","+R+"V"+N:f?"M"+R+","+E*f+"V"+x+"H"+N+"V"+E*f:"M"+R+","+x+"H"+N),O.attr("opacity",1).attr("transform",function(k){return W(X(k)+x)}),T.attr(S+"2",E*u),b.attr(S,E*I).text(y),B.filter(nr).attr("fill","none").attr("font-size",10).attr("font-family","sans-serif").attr("text-anchor",t===zt?"start":t===Tt?"end":"middle"),B.each(function(){this.__axis=X})}return M.scale=function(_){return arguments.length?(e=_,M):e},M.ticks=function(){return a=Array.from(arguments),M},M.tickArguments=function(_){return arguments.length?(a=_==null?[]:Array.from(_),M):a.slice()},M.tickValues=function(_){return arguments.length?(s=_==null?null:Array.from(_),M):s&&s.slice()},M.tickFormat=function(_){return arguments.length?(i=_,M):i},M.tickSize=function(_){return arguments.length?(u=f=+_,M):u},M.tickSizeInner=function(_){return arguments.length?(u=+_,M):u},M.tickSizeOuter=function(_){return arguments.length?(f=+_,M):f},M.tickPadding=function(_){return arguments.length?(C=+_,M):C},M.offset=function(_){return arguments.length?(x=+_,M):x},M}function Le(t){return Ie(xt,t)}function Fe(t){return Ie(Pt,t)}var Re=dt(Ke(),1),Z=dt(oe(),1),Ne=dt(Ye(),1),Be=dt(We(),1),He=dt(Ve(),1),Dt=dt(oe(),1);var Xt=(function(){var t=l(function(D,c,h,m){for(h=h||{},m=D.length;m--;h[D[m]]=c);return h},"o"),e=[6,8,10,12,13,14,15,16,17,18,20,21,22,23,24,25,26,27,28,29,30,31,33,35,36,38,40],a=[1,26],s=[1,27],i=[1,28],u=[1,29],f=[1,30],C=[1,31],x=[1,32],E=[1,33],S=[1,34],W=[1,9],M=[1,10],_=[1,11],v=[1,12],y=[1,13],I=[1,14],L=[1,15],R=[1,16],N=[1,19],X=[1,20],B=[1,21],P=[1,22],O=[1,23],p=[1,25],w=[1,35],T={trace:l(function(){},"trace"),yy:{},symbols_:{error:2,start:3,gantt:4,document:5,EOF:6,line:7,SPACE:8,statement:9,NL:10,weekday:11,weekday_monday:12,weekday_tuesday:13,weekday_wednesday:14,weekday_thursday:15,weekday_friday:16,weekday_saturday:17,weekday_sunday:18,weekend:19,weekend_friday:20,weekend_saturday:21,dateFormat:22,inclusiveEndDates:23,topAxis:24,axisFormat:25,tickInterval:26,excludes:27,includes:28,todayMarker:29,title:30,acc_title:31,acc_title_value:32,acc_descr:33,acc_descr_value:34,acc_descr_multiline_value:35,section:36,clickStatement:37,taskTxt:38,taskData:39,click:40,callbackname:41,callbackargs:42,href:43,clickStatementDebug:44,$accept:0,$end:1},terminals_:{2:"error",4:"gantt",6:"EOF",8:"SPACE",10:"NL",12:"weekday_monday",13:"weekday_tuesday",14:"weekday_wednesday",15:"weekday_thursday",16:"weekday_friday",17:"weekday_saturday",18:"weekday_sunday",20:"weekend_friday",21:"weekend_saturday",22:"dateFormat",23:"inclusiveEndDates",24:"topAxis",25:"axisFormat",26:"tickInterval",27:"excludes",28:"includes",29:"todayMarker",30:"title",31:"acc_title",32:"acc_title_value",33:"acc_descr",34:"acc_descr_value",35:"acc_descr_multiline_value",36:"section",38:"taskTxt",39:"taskData",40:"click",41:"callbackname",42:"callbackargs",43:"href"},productions_:[0,[3,3],[5,0],[5,2],[7,2],[7,1],[7,1],[7,1],[11,1],[11,1],[11,1],[11,1],[11,1],[11,1],[11,1],[19,1],[19,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,2],[9,2],[9,1],[9,1],[9,1],[9,2],[37,2],[37,3],[37,3],[37,4],[37,3],[37,4],[37,2],[44,2],[44,3],[44,3],[44,4],[44,3],[44,4],[44,2]],performAction:l(function(c,h,m,d,g,r,o){var n=r.length-1;switch(g){case 1:return r[n-1];case 2:this.$=[];break;case 3:r[n-1].push(r[n]),this.$=r[n-1];break;case 4:case 5:this.$=r[n];break;case 6:case 7:this.$=[];break;case 8:d.setWeekday("monday");break;case 9:d.setWeekday("tuesday");break;case 10:d.setWeekday("wednesday");break;case 11:d.setWeekday("thursday");break;case 12:d.setWeekday("friday");break;case 13:d.setWeekday("saturday");break;case 14:d.setWeekday("sunday");break;case 15:d.setWeekend("friday");break;case 16:d.setWeekend("saturday");break;case 17:d.setDateFormat(r[n].substr(11)),this.$=r[n].substr(11);break;case 18:d.enableInclusiveEndDates(),this.$=r[n].substr(18);break;case 19:d.TopAxis(),this.$=r[n].substr(8);break;case 20:d.setAxisFormat(r[n].substr(11)),this.$=r[n].substr(11);break;case 21:d.setTickInterval(r[n].substr(13)),this.$=r[n].substr(13);break;case 22:d.setExcludes(r[n].substr(9)),this.$=r[n].substr(9);break;case 23:d.setIncludes(r[n].substr(9)),this.$=r[n].substr(9);break;case 24:d.setTodayMarker(r[n].substr(12)),this.$=r[n].substr(12);break;case 27:d.setDiagramTitle(r[n].substr(6)),this.$=r[n].substr(6);break;case 28:this.$=r[n].trim(),d.setAccTitle(this.$);break;case 29:case 30:this.$=r[n].trim(),d.setAccDescription(this.$);break;case 31:d.addSection(r[n].substr(8)),this.$=r[n].substr(8);break;case 33:d.addTask(r[n-1],r[n]),this.$="task";break;case 34:this.$=r[n-1],d.setClickEvent(r[n-1],r[n],null);break;case 35:this.$=r[n-2],d.setClickEvent(r[n-2],r[n-1],r[n]);break;case 36:this.$=r[n-2],d.setClickEvent(r[n-2],r[n-1],null),d.setLink(r[n-2],r[n]);break;case 37:this.$=r[n-3],d.setClickEvent(r[n-3],r[n-2],r[n-1]),d.setLink(r[n-3],r[n]);break;case 38:this.$=r[n-2],d.setClickEvent(r[n-2],r[n],null),d.setLink(r[n-2],r[n-1]);break;case 39:this.$=r[n-3],d.setClickEvent(r[n-3],r[n-1],r[n]),d.setLink(r[n-3],r[n-2]);break;case 40:this.$=r[n-1],d.setLink(r[n-1],r[n]);break;case 41:case 47:this.$=r[n-1]+" "+r[n];break;case 42:case 43:case 45:this.$=r[n-2]+" "+r[n-1]+" "+r[n];break;case 44:case 46:this.$=r[n-3]+" "+r[n-2]+" "+r[n-1]+" "+r[n];break}},"anonymous"),table:[{3:1,4:[1,2]},{1:[3]},t(e,[2,2],{5:3}),{6:[1,4],7:5,8:[1,6],9:7,10:[1,8],11:17,12:a,13:s,14:i,15:u,16:f,17:C,18:x,19:18,20:E,21:S,22:W,23:M,24:_,25:v,26:y,27:I,28:L,29:R,30:N,31:X,33:B,35:P,36:O,37:24,38:p,40:w},t(e,[2,7],{1:[2,1]}),t(e,[2,3]),{9:36,11:17,12:a,13:s,14:i,15:u,16:f,17:C,18:x,19:18,20:E,21:S,22:W,23:M,24:_,25:v,26:y,27:I,28:L,29:R,30:N,31:X,33:B,35:P,36:O,37:24,38:p,40:w},t(e,[2,5]),t(e,[2,6]),t(e,[2,17]),t(e,[2,18]),t(e,[2,19]),t(e,[2,20]),t(e,[2,21]),t(e,[2,22]),t(e,[2,23]),t(e,[2,24]),t(e,[2,25]),t(e,[2,26]),t(e,[2,27]),{32:[1,37]},{34:[1,38]},t(e,[2,30]),t(e,[2,31]),t(e,[2,32]),{39:[1,39]},t(e,[2,8]),t(e,[2,9]),t(e,[2,10]),t(e,[2,11]),t(e,[2,12]),t(e,[2,13]),t(e,[2,14]),t(e,[2,15]),t(e,[2,16]),{41:[1,40],43:[1,41]},t(e,[2,4]),t(e,[2,28]),t(e,[2,29]),t(e,[2,33]),t(e,[2,34],{42:[1,42],43:[1,43]}),t(e,[2,40],{41:[1,44]}),t(e,[2,35],{43:[1,45]}),t(e,[2,36]),t(e,[2,38],{42:[1,46]}),t(e,[2,37]),t(e,[2,39])],defaultActions:{},parseError:l(function(c,h){if(h.recoverable)this.trace(c);else{var m=new Error(c);throw m.hash=h,m}},"parseError"),parse:l(function(c){var h=this,m=[0],d=[],g=[null],r=[],o=this.table,n="",Y=0,A=0,F=0,G=2,V=1,st=r.slice.call(arguments,1),z=Object.create(this.lexer),Q={yy:{}};for(var et in this.yy)Object.prototype.hasOwnProperty.call(this.yy,et)&&(Q.yy[et]=this.yy[et]);z.setInput(c,Q.yy),Q.yy.lexer=z,Q.yy.parser=this,typeof z.yylloc>"u"&&(z.yylloc={});var rt=z.yylloc;r.push(rt);var ot=z.options&&z.options.ranges;typeof Q.yy.parseError=="function"?this.parseError=Q.yy.parseError:this.parseError=Object.getPrototypeOf(this).parseError;function ct(U){m.length=m.length-2*U,g.length=g.length-U,r.length=r.length-U}l(ct,"popStack");function lt(){var U;return U=d.pop()||z.lex()||V,typeof U!="number"&&(U instanceof Array&&(d=U,U=d.pop()),U=h.symbols_[U]||U),U}l(lt,"lex");for(var H,it,$,q,Ur,Et,ut={},vt,J,se,bt;;){if($=m[m.length-1],this.defaultActions[$]?q=this.defaultActions[$]:((H===null||typeof H>"u")&&(H=lt()),q=o[$]&&o[$][H]),typeof q>"u"||!q.length||!q[0]){var Mt="";bt=[];for(vt in o[$])this.terminals_[vt]&&vt>G&&bt.push("'"+this.terminals_[vt]+"'");z.showPosition?Mt="Parse error on line "+(Y+1)+`:
`+z.showPosition()+`
Expecting `+bt.join(", ")+", got '"+(this.terminals_[H]||H)+"'":Mt="Parse error on line "+(Y+1)+": Unexpected "+(H==V?"end of input":"'"+(this.terminals_[H]||H)+"'"),this.parseError(Mt,{text:z.match,token:this.terminals_[H]||H,line:z.yylineno,loc:rt,expected:bt})}if(q[0]instanceof Array&&q.length>1)throw new Error("Parse Error: multiple actions possible at state: "+$+", token: "+H);switch(q[0]){case 1:m.push(H),g.push(z.yytext),r.push(z.yylloc),m.push(q[1]),H=null,it?(H=it,it=null):(A=z.yyleng,n=z.yytext,Y=z.yylineno,rt=z.yylloc,F>0&&F--);break;case 2:if(J=this.productions_[q[1]][1],ut.$=g[g.length-J],ut._$={first_line:r[r.length-(J||1)].first_line,last_line:r[r.length-1].last_line,first_column:r[r.length-(J||1)].first_column,last_column:r[r.length-1].last_column},ot&&(ut._$.range=[r[r.length-(J||1)].range[0],r[r.length-1].range[1]]),Et=this.performAction.apply(ut,[n,A,Y,Q.yy,q[1],g,r].concat(st)),typeof Et<"u")return Et;J&&(m=m.slice(0,-1*J*2),g=g.slice(0,-1*J),r=r.slice(0,-1*J)),m.push(this.productions_[q[1]][0]),g.push(ut.$),r.push(ut._$),se=o[m[m.length-2]][m[m.length-1]],m.push(se);break;case 3:return!0}}return!0},"parse")},b=(function(){var D={EOF:1,parseError:l(function(h,m){if(this.yy.parser)this.yy.parser.parseError(h,m);else throw new Error(h)},"parseError"),setInput:l(function(c,h){return this.yy=h||this.yy||{},this._input=c,this._more=this._backtrack=this.done=!1,this.yylineno=this.yyleng=0,this.yytext=this.matched=this.match="",this.conditionStack=["INITIAL"],this.yylloc={first_line:1,first_column:0,last_line:1,last_column:0},this.options.ranges&&(this.yylloc.range=[0,0]),this.offset=0,this},"setInput"),input:l(function(){var c=this._input[0];this.yytext+=c,this.yyleng++,this.offset++,this.match+=c,this.matched+=c;var h=c.match(/(?:\r\n?|\n).*/g);return h?(this.yylineno++,this.yylloc.last_line++):this.yylloc.last_column++,this.options.ranges&&this.yylloc.range[1]++,this._input=this._input.slice(1),c},"input"),unput:l(function(c){var h=c.length,m=c.split(/(?:\r\n?|\n)/g);this._input=c+this._input,this.yytext=this.yytext.substr(0,this.yytext.length-h),this.offset-=h;var d=this.match.split(/(?:\r\n?|\n)/g);this.match=this.match.substr(0,this.match.length-1),this.matched=this.matched.substr(0,this.matched.length-1),m.length-1&&(this.yylineno-=m.length-1);var g=this.yylloc.range;return this.yylloc={first_line:this.yylloc.first_line,last_line:this.yylineno+1,first_column:this.yylloc.first_column,last_column:m?(m.length===d.length?this.yylloc.first_column:0)+d[d.length-m.length].length-m[0].length:this.yylloc.first_column-h},this.options.ranges&&(this.yylloc.range=[g[0],g[0]+this.yyleng-h]),this.yyleng=this.yytext.length,this},"unput"),more:l(function(){return this._more=!0,this},"more"),reject:l(function(){if(this.options.backtrack_lexer)this._backtrack=!0;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).
`+this.showPosition(),{text:"",token:null,line:this.yylineno});return this},"reject"),less:l(function(c){this.unput(this.match.slice(c))},"less"),pastInput:l(function(){var c=this.matched.substr(0,this.matched.length-this.match.length);return(c.length>20?"...":"")+c.substr(-20).replace(/\n/g,"")},"pastInput"),upcomingInput:l(function(){var c=this.match;return c.length<20&&(c+=this._input.substr(0,20-c.length)),(c.substr(0,20)+(c.length>20?"...":"")).replace(/\n/g,"")},"upcomingInput"),showPosition:l(function(){var c=this.pastInput(),h=new Array(c.length+1).join("-");return c+this.upcomingInput()+`
`+h+"^"},"showPosition"),test_match:l(function(c,h){var m,d,g;if(this.options.backtrack_lexer&&(g={yylineno:this.yylineno,yylloc:{first_line:this.yylloc.first_line,last_line:this.last_line,first_column:this.yylloc.first_column,last_column:this.yylloc.last_column},yytext:this.yytext,match:this.match,matches:this.matches,matched:this.matched,yyleng:this.yyleng,offset:this.offset,_more:this._more,_input:this._input,yy:this.yy,conditionStack:this.conditionStack.slice(0),done:this.done},this.options.ranges&&(g.yylloc.range=this.yylloc.range.slice(0))),d=c[0].match(/(?:\r\n?|\n).*/g),d&&(this.yylineno+=d.length),this.yylloc={first_line:this.yylloc.last_line,last_line:this.yylineno+1,first_column:this.yylloc.last_column,last_column:d?d[d.length-1].length-d[d.length-1].match(/\r?\n?/)[0].length:this.yylloc.last_column+c[0].length},this.yytext+=c[0],this.match+=c[0],this.matches=c,this.yyleng=this.yytext.length,this.options.ranges&&(this.yylloc.range=[this.offset,this.offset+=this.yyleng]),this._more=!1,this._backtrack=!1,this._input=this._input.slice(c[0].length),this.matched+=c[0],m=this.performAction.call(this,this.yy,this,h,this.conditionStack[this.conditionStack.length-1]),this.done&&this._input&&(this.done=!1),m)return m;if(this._backtrack){for(var r in g)this[r]=g[r];return!1}return!1},"test_match"),next:l(function(){if(this.done)return this.EOF;this._input||(this.done=!0);var c,h,m,d;this._more||(this.yytext="",this.match="");for(var g=this._currentRules(),r=0;r<g.length;r++)if(m=this._input.match(this.rules[g[r]]),m&&(!h||m[0].length>h[0].length)){if(h=m,d=r,this.options.backtrack_lexer){if(c=this.test_match(m,g[r]),c!==!1)return c;if(this._backtrack){h=!1;continue}else return!1}else if(!this.options.flex)break}return h?(c=this.test_match(h,g[d]),c!==!1?c:!1):this._input===""?this.EOF:this.parseError("Lexical error on line "+(this.yylineno+1)+`. Unrecognized text.
`+this.showPosition(),{text:"",token:null,line:this.yylineno})},"next"),lex:l(function(){var h=this.next();return h||this.lex()},"lex"),begin:l(function(h){this.conditionStack.push(h)},"begin"),popState:l(function(){var h=this.conditionStack.length-1;return h>0?this.conditionStack.pop():this.conditionStack[0]},"popState"),_currentRules:l(function(){return this.conditionStack.length&&this.conditionStack[this.conditionStack.length-1]?this.conditions[this.conditionStack[this.conditionStack.length-1]].rules:this.conditions.INITIAL.rules},"_currentRules"),topState:l(function(h){return h=this.conditionStack.length-1-Math.abs(h||0),h>=0?this.conditionStack[h]:"INITIAL"},"topState"),pushState:l(function(h){this.begin(h)},"pushState"),stateStackSize:l(function(){return this.conditionStack.length},"stateStackSize"),options:{"case-insensitive":!0},performAction:l(function(h,m,d,g){var r=g;switch(d){case 0:return this.begin("open_directive"),"open_directive";break;case 1:return this.begin("acc_title"),31;break;case 2:return this.popState(),"acc_title_value";break;case 3:return this.begin("acc_descr"),33;break;case 4:return this.popState(),"acc_descr_value";break;case 5:this.begin("acc_descr_multiline");break;case 6:this.popState();break;case 7:return"acc_descr_multiline_value";case 8:break;case 9:break;case 10:break;case 11:return 10;case 12:break;case 13:break;case 14:this.begin("href");break;case 15:this.popState();break;case 16:return 43;case 17:this.begin("callbackname");break;case 18:this.popState();break;case 19:this.popState(),this.begin("callbackargs");break;case 20:return 41;case 21:this.popState();break;case 22:return 42;case 23:this.begin("click");break;case 24:this.popState();break;case 25:return 40;case 26:return 4;case 27:return 22;case 28:return 23;case 29:return 24;case 30:return 25;case 31:return 26;case 32:return 28;case 33:return 27;case 34:return 29;case 35:return 12;case 36:return 13;case 37:return 14;case 38:return 15;case 39:return 16;case 40:return 17;case 41:return 18;case 42:return 20;case 43:return 21;case 44:return"date";case 45:return 30;case 46:return"accDescription";case 47:return 36;case 48:return 38;case 49:return 39;case 50:return":";case 51:return 6;case 52:return"INVALID"}},"anonymous"),rules:[/^(?:%%\{)/i,/^(?:accTitle\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*\{\s*)/i,/^(?:[\}])/i,/^(?:[^\}]*)/i,/^(?:%%(?!\{)*[^\n]*)/i,/^(?:[^\}]%%*[^\n]*)/i,/^(?:%%*[^\n]*[\n]*)/i,/^(?:[\n]+)/i,/^(?:\s+)/i,/^(?:%[^\n]*)/i,/^(?:href[\s]+["])/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:call[\s]+)/i,/^(?:\([\s]*\))/i,/^(?:\()/i,/^(?:[^(]*)/i,/^(?:\))/i,/^(?:[^)]*)/i,/^(?:click[\s]+)/i,/^(?:[\s\n])/i,/^(?:[^\s\n]*)/i,/^(?:gantt\b)/i,/^(?:dateFormat\s[^#\n;]+)/i,/^(?:inclusiveEndDates\b)/i,/^(?:topAxis\b)/i,/^(?:axisFormat\s[^#\n;]+)/i,/^(?:tickInterval\s[^#\n;]+)/i,/^(?:includes\s[^#\n;]+)/i,/^(?:excludes\s[^#\n;]+)/i,/^(?:todayMarker\s[^\n;]+)/i,/^(?:weekday\s+monday\b)/i,/^(?:weekday\s+tuesday\b)/i,/^(?:weekday\s+wednesday\b)/i,/^(?:weekday\s+thursday\b)/i,/^(?:weekday\s+friday\b)/i,/^(?:weekday\s+saturday\b)/i,/^(?:weekday\s+sunday\b)/i,/^(?:weekend\s+friday\b)/i,/^(?:weekend\s+saturday\b)/i,/^(?:\d\d\d\d-\d\d-\d\d\b)/i,/^(?:title\s[^\n]+)/i,/^(?:accDescription\s[^#\n;]+)/i,/^(?:section\s[^\n]+)/i,/^(?:[^:\n]+)/i,/^(?::[^#\n;]+)/i,/^(?::)/i,/^(?:$)/i,/^(?:.)/i],conditions:{acc_descr_multiline:{rules:[6,7],inclusive:!1},acc_descr:{rules:[4],inclusive:!1},acc_title:{rules:[2],inclusive:!1},callbackargs:{rules:[21,22],inclusive:!1},callbackname:{rules:[18,19,20],inclusive:!1},href:{rules:[15,16],inclusive:!1},click:{rules:[24,25],inclusive:!1},INITIAL:{rules:[0,1,3,5,8,9,10,11,12,13,14,17,23,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52],inclusive:!0}}};return D})();T.lexer=b;function k(){this.yy={}}return l(k,"Parser"),k.prototype=T,T.Parser=k,new k})();Xt.parser=Xt;var ar=Xt;Z.default.extend(Ne.default);Z.default.extend(Be.default);Z.default.extend(He.default);var Oe={friday:5,saturday:6},K="",Qt="",$t=void 0,Kt="",yt=[],gt=[],Jt=new Map,te=[],St=[],ht="",ee="",je=["active","done","crit","milestone","vert"],re=[],pt=!1,ie=!1,ne="sunday",Ct="saturday",qt=0,sr=l(function(){te=[],St=[],ht="",re=[],wt=0,Zt=void 0,_t=void 0,j=[],K="",Qt="",ee="",$t=void 0,Kt="",yt=[],gt=[],pt=!1,ie=!1,qt=0,Jt=new Map,ue(),ne="sunday",Ct="saturday"},"clear"),or=l(function(t){Qt=t},"setAxisFormat"),cr=l(function(){return Qt},"getAxisFormat"),lr=l(function(t){$t=t},"setTickInterval"),ur=l(function(){return $t},"getTickInterval"),dr=l(function(t){Kt=t},"setTodayMarker"),fr=l(function(){return Kt},"getTodayMarker"),hr=l(function(t){K=t},"setDateFormat"),kr=l(function(){pt=!0},"enableInclusiveEndDates"),mr=l(function(){return pt},"endDatesAreInclusive"),yr=l(function(){ie=!0},"enableTopAxis"),gr=l(function(){return ie},"topAxisEnabled"),pr=l(function(t){ee=t},"setDisplayMode"),vr=l(function(){return ee},"getDisplayMode"),br=l(function(){return K},"getDateFormat"),Tr=l(function(t){yt=t.toLowerCase().split(/[\s,]+/)},"setIncludes"),xr=l(function(){return yt},"getIncludes"),wr=l(function(t){gt=t.toLowerCase().split(/[\s,]+/)},"setExcludes"),_r=l(function(){return gt},"getExcludes"),Dr=l(function(){return Jt},"getLinks"),Sr=l(function(t){ht=t,te.push(t)},"addSection"),Cr=l(function(){return te},"getSections"),Er=l(function(){let t=ze(),e=10,a=0;for(;!t&&a<e;)t=ze(),a++;return St=j,St},"getTasks"),Ge=l(function(t,e,a,s){let i=t.format(e.trim()),u=t.format("YYYY-MM-DD");return s.includes(i)||s.includes(u)?!1:a.includes("weekends")&&(t.isoWeekday()===Oe[Ct]||t.isoWeekday()===Oe[Ct]+1)||a.includes(t.format("dddd").toLowerCase())?!0:a.includes(i)||a.includes(u)},"isInvalidDate"),Mr=l(function(t){ne=t},"setWeekday"),Ar=l(function(){return ne},"getWeekday"),Ir=l(function(t){Ct=t},"setWeekend"),Xe=l(function(t,e,a,s){if(!a.length||t.manualEndTime)return;let i;t.startTime instanceof Date?i=(0,Z.default)(t.startTime):i=(0,Z.default)(t.startTime,e,!0),i=i.add(1,"d");let u;t.endTime instanceof Date?u=(0,Z.default)(t.endTime):u=(0,Z.default)(t.endTime,e,!0);let[f,C]=Lr(i,u,e,a,s);t.endTime=f.toDate(),t.renderEndTime=C},"checkTaskDates"),Lr=l(function(t,e,a,s,i){let u=!1,f=null;for(;t<=e;)u||(f=e.toDate()),u=Ge(t,a,s,i),u&&(e=e.add(1,"d")),t=t.add(1,"d");return[e,f]},"fixTaskDates"),Ut=l(function(t,e,a){a=a.trim();let i=/^after\s+(?<ids>[\d\w- ]+)/.exec(a);if(i!==null){let f=null;for(let x of i.groups.ids.split(" ")){let E=at(x);E!==void 0&&(!f||E.endTime>f.endTime)&&(f=E)}if(f)return f.endTime;let C=new Date;return C.setHours(0,0,0,0),C}let u=(0,Z.default)(a,e.trim(),!0);if(u.isValid())return u.toDate();{kt.debug("Invalid date:"+a),kt.debug("With date format:"+e.trim());let f=new Date(a);if(f===void 0||isNaN(f.getTime())||f.getFullYear()<-1e4||f.getFullYear()>1e4)throw new Error("Invalid date:"+a);return f}},"getStartDate"),qe=l(function(t){let e=/^(\d+(?:\.\d+)?)([Mdhmswy]|ms)$/.exec(t.trim());return e!==null?[Number.parseFloat(e[1]),e[2]]:[NaN,"ms"]},"parseDuration"),Ue=l(function(t,e,a,s=!1){a=a.trim();let u=/^until\s+(?<ids>[\d\w- ]+)/.exec(a);if(u!==null){let S=null;for(let M of u.groups.ids.split(" ")){let _=at(M);_!==void 0&&(!S||_.startTime<S.startTime)&&(S=_)}if(S)return S.startTime;let W=new Date;return W.setHours(0,0,0,0),W}let f=(0,Z.default)(a,e.trim(),!0);if(f.isValid())return s&&(f=f.add(1,"d")),f.toDate();let C=(0,Z.default)(t),[x,E]=qe(a);if(!Number.isNaN(x)){let S=C.add(x,E);S.isValid()&&(C=S)}return C.toDate()},"getEndDate"),wt=0,ft=l(function(t){return t===void 0?(wt=wt+1,"task"+wt):t},"parseId"),Fr=l(function(t,e){let a;e.substr(0,1)===":"?a=e.substr(1,e.length):a=e;let s=a.split(","),i={};ae(s,i,je);for(let f=0;f<s.length;f++)s[f]=s[f].trim();let u="";switch(s.length){case 1:i.id=ft(),i.startTime=t.endTime,u=s[0];break;case 2:i.id=ft(),i.startTime=Ut(void 0,K,s[0]),u=s[1];break;case 3:i.id=ft(s[0]),i.startTime=Ut(void 0,K,s[1]),u=s[2];break;default:}return u&&(i.endTime=Ue(i.startTime,K,u,pt),i.manualEndTime=(0,Z.default)(u,"YYYY-MM-DD",!0).isValid(),Xe(i,K,gt,yt)),i},"compileData"),Yr=l(function(t,e){let a;e.substr(0,1)===":"?a=e.substr(1,e.length):a=e;let s=a.split(","),i={};ae(s,i,je);for(let u=0;u<s.length;u++)s[u]=s[u].trim();switch(s.length){case 1:i.id=ft(),i.startTime={type:"prevTaskEnd",id:t},i.endTime={data:s[0]};break;case 2:i.id=ft(),i.startTime={type:"getStartDate",startData:s[0]},i.endTime={data:s[1]};break;case 3:i.id=ft(s[0]),i.startTime={type:"getStartDate",startData:s[1]},i.endTime={data:s[2]};break;default:}return i},"parseData"),Zt,_t,j=[],Ze={},Wr=l(function(t,e){let a={section:ht,type:ht,processed:!1,manualEndTime:!1,renderEndTime:null,raw:{data:e},task:t,classes:[]},s=Yr(_t,e);a.raw.startTime=s.startTime,a.raw.endTime=s.endTime,a.id=s.id,a.prevTaskId=_t,a.active=s.active,a.done=s.done,a.crit=s.crit,a.milestone=s.milestone,a.vert=s.vert,a.order=qt,qt++;let i=j.push(a);_t=a.id,Ze[a.id]=i-1},"addTask"),at=l(function(t){let e=Ze[t];return j[e]},"findTaskById"),Vr=l(function(t,e){let a={section:ht,type:ht,description:t,task:t,classes:[]},s=Fr(Zt,e);a.startTime=s.startTime,a.endTime=s.endTime,a.id=s.id,a.active=s.active,a.done=s.done,a.crit=s.crit,a.milestone=s.milestone,a.vert=s.vert,Zt=a,St.push(a)},"addTaskOrg"),ze=l(function(){let t=l(function(a){let s=j[a],i="";switch(j[a].raw.startTime.type){case"prevTaskEnd":{let u=at(s.prevTaskId);s.startTime=u.endTime;break}case"getStartDate":i=Ut(void 0,K,j[a].raw.startTime.startData),i&&(j[a].startTime=i);break}return j[a].startTime&&(j[a].endTime=Ue(j[a].startTime,K,j[a].raw.endTime.data,pt),j[a].endTime&&(j[a].processed=!0,j[a].manualEndTime=(0,Z.default)(j[a].raw.endTime.data,"YYYY-MM-DD",!0).isValid(),Xe(j[a],K,gt,yt))),j[a].processed},"compileTask"),e=!0;for(let[a,s]of j.entries())t(a),e=e&&s.processed;return e},"compileTasks"),Or=l(function(t,e){let a=e;nt().securityLevel!=="loose"&&(a=(0,Re.sanitizeUrl)(e)),t.split(",").forEach(function(s){at(s)!==void 0&&($e(s,()=>{window.open(a,"_self")}),Jt.set(s,a))}),Qe(t,"clickable")},"setLink"),Qe=l(function(t,e){t.split(",").forEach(function(a){let s=at(a);s!==void 0&&s.classes.push(e)})},"setClass"),zr=l(function(t,e,a){if(nt().securityLevel!=="loose"||e===void 0)return;let s=[];if(typeof a=="string"){s=a.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);for(let u=0;u<s.length;u++){let f=s[u].trim();f.startsWith('"')&&f.endsWith('"')&&(f=f.substr(1,f.length-2)),s[u]=f}}s.length===0&&s.push(t),at(t)!==void 0&&$e(t,()=>{Me.runFunc(e,...s)})},"setClickFun"),$e=l(function(t,e){re.push(function(){let a=document.querySelector(`[id="${t}"]`);a!==null&&a.addEventListener("click",function(){e()})},function(){let a=document.querySelector(`[id="${t}-text"]`);a!==null&&a.addEventListener("click",function(){e()})})},"pushFun"),Pr=l(function(t,e,a){t.split(",").forEach(function(s){zr(s,e,a)}),Qe(t,"clickable")},"setClickEvent"),Rr=l(function(t){re.forEach(function(e){e(t)})},"bindFunctions"),Nr={getConfig:l(()=>nt().gantt,"getConfig"),clear:sr,setDateFormat:hr,getDateFormat:br,enableInclusiveEndDates:kr,endDatesAreInclusive:mr,enableTopAxis:yr,topAxisEnabled:gr,setAxisFormat:or,getAxisFormat:cr,setTickInterval:lr,getTickInterval:ur,setTodayMarker:dr,getTodayMarker:fr,setAccTitle:de,getAccTitle:fe,setDiagramTitle:me,getDiagramTitle:ye,setDisplayMode:pr,getDisplayMode:vr,setAccDescription:he,getAccDescription:ke,addSection:Sr,getSections:Cr,getTasks:Er,addTask:Wr,findTaskById:at,addTaskOrg:Vr,setIncludes:Tr,getIncludes:xr,setExcludes:wr,getExcludes:_r,setClickEvent:Pr,setLink:Or,getLinks:Dr,bindFunctions:Rr,parseDuration:qe,isInvalidDate:Ge,setWeekday:Mr,getWeekday:Ar,setWeekend:Ir};function ae(t,e,a){let s=!0;for(;s;)s=!1,a.forEach(function(i){let u="^\\s*"+i+"\\s*$",f=new RegExp(u);t[0].match(f)&&(e[i]=!0,t.shift(1),s=!0)})}l(ae,"getTaskTags");var Br=l(function(){kt.debug("Something is calling, setConf, remove the call")},"setConf"),Pe={monday:Te,tuesday:xe,wednesday:we,thursday:_e,friday:De,saturday:Se,sunday:be},Hr=l((t,e)=>{let a=[...t].map(()=>-1/0),s=[...t].sort((u,f)=>u.startTime-f.startTime||u.order-f.order),i=0;for(let u of s)for(let f=0;f<a.length;f++)if(u.startTime>=a[f]){a[f]=u.endTime,u.order=f+e,f>i&&(i=f);break}return i},"getMaxIntersections"),tt,jr=l(function(t,e,a,s){let i=nt().gantt,u=nt().securityLevel,f;u==="sandbox"&&(f=mt("#i"+e));let C=u==="sandbox"?mt(f.nodes()[0].contentDocument.body):mt("body"),x=u==="sandbox"?f.nodes()[0].contentDocument:document,E=x.getElementById(e);tt=E.parentElement.offsetWidth,tt===void 0&&(tt=1200),i.useWidth!==void 0&&(tt=i.useWidth);let S=s.db.getTasks(),W=[];for(let p of S)W.push(p.type);W=O(W);let M={},_=2*i.topPadding;if(s.db.getDisplayMode()==="compact"||i.displayMode==="compact"){let p={};for(let T of S)p[T.section]===void 0?p[T.section]=[T]:p[T.section].push(T);let w=0;for(let T of Object.keys(p)){let b=Hr(p[T],w)+1;w+=b,_+=b*(i.barHeight+i.barGap),M[T]=b}}else{_+=S.length*(i.barHeight+i.barGap);for(let p of W)M[p]=S.filter(w=>w.type===p).length}E.setAttribute("viewBox","0 0 "+tt+" "+_);let v=C.select(`[id="${e}"]`),y=Ee().domain([pe(S,function(p){return p.startTime}),ge(S,function(p){return p.endTime})]).rangeRound([0,tt-i.leftPadding-i.rightPadding]);function I(p,w){let T=p.startTime,b=w.startTime,k=0;return T>b?k=1:T<b&&(k=-1),k}l(I,"taskCompare"),S.sort(I),L(S,tt,_),le(v,_,tt,i.useMaxWidth),v.append("text").text(s.db.getDiagramTitle()).attr("x",tt/2).attr("y",i.titleTopMargin).attr("class","titleText");function L(p,w,T){let b=i.barHeight,k=b+i.barGap,D=i.topPadding,c=i.leftPadding,h=Ce().domain([0,W.length]).range(["#00B9FA","#F95002"]).interpolate(ve);N(k,D,c,w,T,p,s.db.getExcludes(),s.db.getIncludes()),X(c,D,w,T),R(p,k,D,c,b,h,w,T),B(k,D,c,b,h),P(c,D,w,T)}l(L,"makeGantt");function R(p,w,T,b,k,D,c){p.sort((o,n)=>o.vert===n.vert?0:o.vert?1:-1);let m=[...new Set(p.map(o=>o.order))].map(o=>p.find(n=>n.order===o));v.append("g").selectAll("rect").data(m).enter().append("rect").attr("x",0).attr("y",function(o,n){return n=o.order,n*w+T-2}).attr("width",function(){return c-i.rightPadding/2}).attr("height",w).attr("class",function(o){for(let[n,Y]of W.entries())if(o.type===Y)return"section section"+n%i.numberSectionStyles;return"section section0"}).enter();let d=v.append("g").selectAll("rect").data(p).enter(),g=s.db.getLinks();if(d.append("rect").attr("id",function(o){return o.id}).attr("rx",3).attr("ry",3).attr("x",function(o){return o.milestone?y(o.startTime)+b+.5*(y(o.endTime)-y(o.startTime))-.5*k:y(o.startTime)+b}).attr("y",function(o,n){return n=o.order,o.vert?i.gridLineStartPadding:n*w+T}).attr("width",function(o){return o.milestone?k:o.vert?.08*k:y(o.renderEndTime||o.endTime)-y(o.startTime)}).attr("height",function(o){return o.vert?S.length*(i.barHeight+i.barGap)+i.barHeight*2:k}).attr("transform-origin",function(o,n){return n=o.order,(y(o.startTime)+b+.5*(y(o.endTime)-y(o.startTime))).toString()+"px "+(n*w+T+.5*k).toString()+"px"}).attr("class",function(o){let n="task",Y="";o.classes.length>0&&(Y=o.classes.join(" "));let A=0;for(let[G,V]of W.entries())o.type===V&&(A=G%i.numberSectionStyles);let F="";return o.active?o.crit?F+=" activeCrit":F=" active":o.done?o.crit?F=" doneCrit":F=" done":o.crit&&(F+=" crit"),F.length===0&&(F=" task"),o.milestone&&(F=" milestone "+F),o.vert&&(F=" vert "+F),F+=A,F+=" "+Y,n+F}),d.append("text").attr("id",function(o){return o.id+"-text"}).text(function(o){return o.task}).attr("font-size",i.fontSize).attr("x",function(o){let n=y(o.startTime),Y=y(o.renderEndTime||o.endTime);if(o.milestone&&(n+=.5*(y(o.endTime)-y(o.startTime))-.5*k,Y=n+k),o.vert)return y(o.startTime)+b;let A=this.getBBox().width;return A>Y-n?Y+A+1.5*i.leftPadding>c?n+b-5:Y+b+5:(Y-n)/2+n+b}).attr("y",function(o,n){return o.vert?i.gridLineStartPadding+S.length*(i.barHeight+i.barGap)+60:(n=o.order,n*w+i.barHeight/2+(i.fontSize/2-2)+T)}).attr("text-height",k).attr("class",function(o){let n=y(o.startTime),Y=y(o.endTime);o.milestone&&(Y=n+k);let A=this.getBBox().width,F="";o.classes.length>0&&(F=o.classes.join(" "));let G=0;for(let[st,z]of W.entries())o.type===z&&(G=st%i.numberSectionStyles);let V="";return o.active&&(o.crit?V="activeCritText"+G:V="activeText"+G),o.done?o.crit?V=V+" doneCritText"+G:V=V+" doneText"+G:o.crit&&(V=V+" critText"+G),o.milestone&&(V+=" milestoneText"),o.vert&&(V+=" vertText"),A>Y-n?Y+A+1.5*i.leftPadding>c?F+" taskTextOutsideLeft taskTextOutside"+G+" "+V:F+" taskTextOutsideRight taskTextOutside"+G+" "+V+" width-"+A:F+" taskText taskText"+G+" "+V+" width-"+A}),nt().securityLevel==="sandbox"){let o;o=mt("#i"+e);let n=o.nodes()[0].contentDocument;d.filter(function(Y){return g.has(Y.id)}).each(function(Y){var A=n.querySelector("#"+Y.id),F=n.querySelector("#"+Y.id+"-text");let G=A.parentNode;var V=n.createElement("a");V.setAttribute("xlink:href",g.get(Y.id)),V.setAttribute("target","_top"),G.appendChild(V),V.appendChild(A),V.appendChild(F)})}}l(R,"drawRects");function N(p,w,T,b,k,D,c,h){if(c.length===0&&h.length===0)return;let m,d;for(let{startTime:A,endTime:F}of D)(m===void 0||A<m)&&(m=A),(d===void 0||F>d)&&(d=F);if(!m||!d)return;if((0,Dt.default)(d).diff((0,Dt.default)(m),"year")>5){kt.warn("The difference between the min and max time is more than 5 years. This will cause performance issues. Skipping drawing exclude days.");return}let g=s.db.getDateFormat(),r=[],o=null,n=(0,Dt.default)(m);for(;n.valueOf()<=d;)s.db.isInvalidDate(n,g,c,h)?o?o.end=n:o={start:n,end:n}:o&&(r.push(o),o=null),n=n.add(1,"d");v.append("g").selectAll("rect").data(r).enter().append("rect").attr("id",A=>"exclude-"+A.start.format("YYYY-MM-DD")).attr("x",A=>y(A.start.startOf("day"))+T).attr("y",i.gridLineStartPadding).attr("width",A=>y(A.end.endOf("day"))-y(A.start.startOf("day"))).attr("height",k-w-i.gridLineStartPadding).attr("transform-origin",function(A,F){return(y(A.start)+T+.5*(y(A.end)-y(A.start))).toString()+"px "+(F*p+.5*k).toString()+"px"}).attr("class","exclude-range")}l(N,"drawExcludeDays");function X(p,w,T,b){let k=s.db.getDateFormat(),D=s.db.getAxisFormat(),c;D?c=D:k==="D"?c="%d":c=i.axisFormat??"%Y-%m-%d";let h=Fe(y).tickSize(-b+w+i.gridLineStartPadding).tickFormat(Ot(c)),d=/^([1-9]\d*)(millisecond|second|minute|hour|day|week|month)$/.exec(s.db.getTickInterval()||i.tickInterval);if(d!==null){let g=d[1],r=d[2],o=s.db.getWeekday()||i.weekday;switch(r){case"millisecond":h.ticks(It.every(g));break;case"second":h.ticks(Lt.every(g));break;case"minute":h.ticks(Ft.every(g));break;case"hour":h.ticks(Yt.every(g));break;case"day":h.ticks(Wt.every(g));break;case"week":h.ticks(Pe[o].every(g));break;case"month":h.ticks(Vt.every(g));break}}if(v.append("g").attr("class","grid").attr("transform","translate("+p+", "+(b-50)+")").call(h).selectAll("text").style("text-anchor","middle").attr("fill","#000").attr("stroke","none").attr("font-size",10).attr("dy","1em"),s.db.topAxisEnabled()||i.topAxis){let g=Le(y).tickSize(-b+w+i.gridLineStartPadding).tickFormat(Ot(c));if(d!==null){let r=d[1],o=d[2],n=s.db.getWeekday()||i.weekday;switch(o){case"millisecond":g.ticks(It.every(r));break;case"second":g.ticks(Lt.every(r));break;case"minute":g.ticks(Ft.every(r));break;case"hour":g.ticks(Yt.every(r));break;case"day":g.ticks(Wt.every(r));break;case"week":g.ticks(Pe[n].every(r));break;case"month":g.ticks(Vt.every(r));break}}v.append("g").attr("class","grid").attr("transform","translate("+p+", "+w+")").call(g).selectAll("text").style("text-anchor","middle").attr("fill","#000").attr("stroke","none").attr("font-size",10)}}l(X,"makeGrid");function B(p,w){let T=0,b=Object.keys(M).map(k=>[k,M[k]]);v.append("g").selectAll("text").data(b).enter().append(function(k){let D=k[0].split(ce.lineBreakRegex),c=-(D.length-1)/2,h=x.createElementNS("http://www.w3.org/2000/svg","text");h.setAttribute("dy",c+"em");for(let[m,d]of D.entries()){let g=x.createElementNS("http://www.w3.org/2000/svg","tspan");g.setAttribute("alignment-baseline","central"),g.setAttribute("x","10"),m>0&&g.setAttribute("dy","1em"),g.textContent=d,h.appendChild(g)}return h}).attr("x",10).attr("y",function(k,D){if(D>0)for(let c=0;c<D;c++)return T+=b[D-1][1],k[1]*p/2+T*p+w;else return k[1]*p/2+w}).attr("font-size",i.sectionFontSize).attr("class",function(k){for(let[D,c]of W.entries())if(k[0]===c)return"sectionTitle sectionTitle"+D%i.numberSectionStyles;return"sectionTitle"})}l(B,"vertLabels");function P(p,w,T,b){let k=s.db.getTodayMarker();if(k==="off")return;let D=v.append("g").attr("class","today"),c=new Date,h=D.append("line");h.attr("x1",y(c)+p).attr("x2",y(c)+p).attr("y1",i.titleTopMargin).attr("y2",b-i.titleTopMargin).attr("class","today"),k!==""&&h.attr("style",k.replace(/,/g,";"))}l(P,"drawToday");function O(p){let w={},T=[];for(let b=0,k=p.length;b<k;++b)Object.prototype.hasOwnProperty.call(w,p[b])||(w[p[b]]=!0,T.push(p[b]));return T}l(O,"checkUnique")},"draw"),Gr={setConf:Br,draw:jr},Xr=l(t=>`
  .mermaid-main-font {
        font-family: ${t.fontFamily};
  }

  .exclude-range {
    fill: ${t.excludeBkgColor};
  }

  .section {
    stroke: none;
    opacity: 0.2;
  }

  .section0 {
    fill: ${t.sectionBkgColor};
  }

  .section2 {
    fill: ${t.sectionBkgColor2};
  }

  .section1,
  .section3 {
    fill: ${t.altSectionBkgColor};
    opacity: 0.2;
  }

  .sectionTitle0 {
    fill: ${t.titleColor};
  }

  .sectionTitle1 {
    fill: ${t.titleColor};
  }

  .sectionTitle2 {
    fill: ${t.titleColor};
  }

  .sectionTitle3 {
    fill: ${t.titleColor};
  }

  .sectionTitle {
    text-anchor: start;
    font-family: ${t.fontFamily};
  }


  /* Grid and axis */

  .grid .tick {
    stroke: ${t.gridColor};
    opacity: 0.8;
    shape-rendering: crispEdges;
  }

  .grid .tick text {
    font-family: ${t.fontFamily};
    fill: ${t.textColor};
  }

  .grid path {
    stroke-width: 0;
  }


  /* Today line */

  .today {
    fill: none;
    stroke: ${t.todayLineColor};
    stroke-width: 2px;
  }


  /* Task styling */

  /* Default task */

  .task {
    stroke-width: 2;
  }

  .taskText {
    text-anchor: middle;
    font-family: ${t.fontFamily};
  }

  .taskTextOutsideRight {
    fill: ${t.taskTextDarkColor};
    text-anchor: start;
    font-family: ${t.fontFamily};
  }

  .taskTextOutsideLeft {
    fill: ${t.taskTextDarkColor};
    text-anchor: end;
  }


  /* Special case clickable */

  .task.clickable {
    cursor: pointer;
  }

  .taskText.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }

  .taskTextOutsideLeft.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }

  .taskTextOutsideRight.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }


  /* Specific task settings for the sections*/

  .taskText0,
  .taskText1,
  .taskText2,
  .taskText3 {
    fill: ${t.taskTextColor};
  }

  .task0,
  .task1,
  .task2,
  .task3 {
    fill: ${t.taskBkgColor};
    stroke: ${t.taskBorderColor};
  }

  .taskTextOutside0,
  .taskTextOutside2
  {
    fill: ${t.taskTextOutsideColor};
  }

  .taskTextOutside1,
  .taskTextOutside3 {
    fill: ${t.taskTextOutsideColor};
  }


  /* Active task */

  .active0,
  .active1,
  .active2,
  .active3 {
    fill: ${t.activeTaskBkgColor};
    stroke: ${t.activeTaskBorderColor};
  }

  .activeText0,
  .activeText1,
  .activeText2,
  .activeText3 {
    fill: ${t.taskTextDarkColor} !important;
  }


  /* Completed task */

  .done0,
  .done1,
  .done2,
  .done3 {
    stroke: ${t.doneTaskBorderColor};
    fill: ${t.doneTaskBkgColor};
    stroke-width: 2;
  }

  .doneText0,
  .doneText1,
  .doneText2,
  .doneText3 {
    fill: ${t.taskTextDarkColor} !important;
  }


  /* Tasks on the critical line */

  .crit0,
  .crit1,
  .crit2,
  .crit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.critBkgColor};
    stroke-width: 2;
  }

  .activeCrit0,
  .activeCrit1,
  .activeCrit2,
  .activeCrit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.activeTaskBkgColor};
    stroke-width: 2;
  }

  .doneCrit0,
  .doneCrit1,
  .doneCrit2,
  .doneCrit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.doneTaskBkgColor};
    stroke-width: 2;
    cursor: pointer;
    shape-rendering: crispEdges;
  }

  .milestone {
    transform: rotate(45deg) scale(0.8,0.8);
  }

  .milestoneText {
    font-style: italic;
  }
  .doneCritText0,
  .doneCritText1,
  .doneCritText2,
  .doneCritText3 {
    fill: ${t.taskTextDarkColor} !important;
  }

  .vert {
    stroke: ${t.vertLineColor};
  }

  .vertText {
    font-size: 15px;
    text-anchor: middle;
    fill: ${t.vertLineColor} !important;
  }

  .activeCritText0,
  .activeCritText1,
  .activeCritText2,
  .activeCritText3 {
    fill: ${t.taskTextDarkColor} !important;
  }

  .titleText {
    text-anchor: middle;
    font-size: 18px;
    fill: ${t.titleColor||t.textColor};
    font-family: ${t.fontFamily};
  }
`,"getStyles"),qr=Xr,Jr={parser:ar,db:Nr,renderer:Gr,styles:qr};export{Jr as diagram};
