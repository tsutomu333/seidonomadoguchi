/* せいどの窓口：制度の「部品」と共通の計算エンジン
 * 制度ごとの部品（furusato / ideco / jutaku / kabe / baito）を、
 * 真ん中の共通計算（年収→所得→控除→所得税・住民税）でつなぐ。
 * どのページも <section id="calc" data-mods="furusato,ideco"> の並べ方だけを変える。
 * 前提：2026年分の所得税・2027年度の住民税のルール（2027年分も同じ数字）。社会保険料は年収の約15%。
 */
(function(root){
'use strict';

/* ===== 共通の計算 ===== */
function kyuyo(y){ // 給与所得控除（2026・2027年分：最低74万円）
  let k; if(y<=1625000) k=550000; else if(y<=1800000) k=y*0.4-100000; else if(y<=3600000) k=y*0.3+80000; else if(y<=6600000) k=y*0.2+440000; else if(y<=8500000) k=y*0.1+1100000; else k=1950000;
  return Math.min(y,Math.max(k,740000));
}
const kisoI=g=>g<=4890000?1040000:g<=6550000?670000:g<=23500000?620000:0; // 所得税の基礎控除
const fl1000=v=>Math.max(0,Math.floor(v/1000)*1000);
const BR=[[1950000,.05,0],[3300000,.10,97500],[6950000,.20,427500],[9000000,.23,636000],[18000000,.33,1536000],[40000000,.40,2796000],[Infinity,.45,4796000]];
function baseTax(t){ t=fl1000(t); for(const [l,r,d] of BR){ if(t<=l) return Math.max(0,t*r-d); } }
function rate(t){ if(t<=0) return 0.05; for(const [l,r] of BR){ if(t<=l) return r; } }
function incomeTax(t){ return Math.floor(baseTax(t)*1.021/100)*100; }
function chosei(base,sa){ return base<=2000000? Math.min(sa,base)*0.05 : Math.max(sa-(base-2000000),50000)*0.05; }
function juminSimple(g,sh,ded,sa){ // 本人以外（配偶者・子）の住民税：所得割＋均等割
  if(g<=450000) return 0;
  const b=fl1000(g-sh-430000-ded);
  return Math.max(0,Math.floor((b*0.10-chosei(b,sa))/100)*100)+5000;
}
// 配偶者控除・配偶者特別控除 [本人の合計所得900万以下, 950万以下, 1000万以下]
const SPI=[[620000,[380000,260000,130000]],[950000,[380000,260000,130000]],[1000000,[360000,240000,120000]],[1050000,[310000,210000,110000]],[1100000,[260000,180000,90000]],[1150000,[210000,140000,70000]],[1200000,[160000,110000,60000]],[1250000,[110000,80000,40000]],[1300000,[60000,40000,20000]],[1330000,[30000,20000,10000]]];
const SPJ=[[620000,[330000,220000,110000]],[1000000,[330000,220000,110000]],[1050000,[310000,210000,110000]],[1100000,[260000,180000,90000]],[1150000,[210000,140000,70000]],[1200000,[160000,110000,60000]],[1250000,[110000,80000,40000]],[1300000,[60000,40000,20000]],[1330000,[30000,20000,10000]]];
function spDed(tbl,g,gw){ if(g>10000000) return 0; const t=g<=9000000?0:g<=9500000?1:2; for(const [l,v] of tbl){ if(gw<=l) return v[t]; } return 0; }
// 19〜22歳の子の合計所得ごとの親の控除 [上限, 所得税, 住民税]（62万以下は特定扶養控除、こえると特定親族特別控除）
const OYA=[[620000,630000,450000],[850000,630000,450000],[900000,610000,450000],[950000,510000,450000],[1000000,410000,410000],[1050000,310000,310000],[1100000,210000,210000],[1150000,110000,110000],[1200000,60000,60000],[1230000,30000,30000]];
function oyaDed(gs){ for(const [l,i,j] of OYA){ if(gs<=l) return [i,j]; } return [0,0]; }

/* 本人（家計の中心で働く人）の1年の税金
 * st: {inc, kou, dai, gw(配偶者の合計所得 / null=配偶者控除なし), gs(大学生の子の合計所得 / null), ideco(年額), bal, capB, fmode}
 * D: ふるさと納税の寄付額 */
function core(st,D){
  D=D||0;
  const inc=st.inc, kids=st.kou+st.dai+(st.gs!=null?1:0);
  let g=Math.max(0,inc-kyuyo(inc));
  if(inc>8500000&&kids>0) g=Math.max(0,g-(Math.min(inc,10000000)-8500000)*0.10); // 所得金額調整控除
  const sh=inc*0.15;
  let spI=0,spJ=0,sa=50000;
  if(st.gw!=null){ spI=spDed(SPI,g,st.gw); spJ=spDed(SPJ,g,st.gw); if(st.gw<=620000&&g<=10000000) sa+=g<=9000000?50000:g<=9500000?40000:20000; }
  let dI=st.kou*380000+st.dai*630000, dJ=st.kou*330000+st.dai*450000; sa+=st.kou*50000+st.dai*180000;
  if(st.gs!=null){ const [a,b]=oyaDed(st.gs); dI+=a; dJ+=b; if(st.gs<=620000) sa+=180000; }
  const ide=st.ideco||0, don=D>2000?D-2000:0;
  const TI=fl1000(g-sh-kisoI(g)-spI-dI-ide-(st.fmode==='kakutei'?don:0));
  const bt=baseTax(TI);
  const C=st.bal>0?Math.floor(Math.min(st.bal,st.capB)*0.007/100)*100:0; // 住宅ローン控除の額
  const hlI=Math.min(C,bt);
  const IT=Math.floor((bt-hlI)*1.021/100)*100;
  const hlJ=Math.min(C-hlI,Math.floor(TI*0.05),97500);
  const JB=fl1000(g-sh-430000-spJ-dJ-ide);
  const S=Math.max(0,JB*0.10-chosei(JB,sa)); // 住民税の所得割（調整控除のあと）
  const r=rate(JB-sa-Math.max(kisoI(g)-480000,0));
  const kihon=don*0.10, tokurei=Math.min(don*(0.90-r*1.021),S*0.20);
  const shinkoku=st.fmode==='kakutei'?0:tokurei*(r*1.021)/(0.90-r*1.021);
  const JT=Math.floor(Math.max(0,Math.max(0,S-hlJ)-kihon-tokurei-shinkoku)/100)*100;
  return {IT,JT,total:IT+JT,C,g,sh,TI,JB};
}
function net(st){ const c=core(st,0); return st.inc-c.sh-c.total-5000; } // 本人の手取り（住民税の均等割5,000円をふくむ）
function burden(st,D){ return D-(core(st,0).total-core(st,D).total); }
function furuLimit(st){ // 自己負担2,000円で済む寄付の上限（端数の切り捨てで数百円ぶれるので2,500円までを目安）
  if(burden(st,3000)>2500) return 0;
  let lo=3, hi=Math.ceil(Math.max(150000,st.inc*0.09)/1000);
  while(lo<hi){ const m=Math.ceil((lo+hi)/2); if(burden(st,m*1000)<=2500) lo=m; else hi=m-1; }
  return lo*1000;
}
function hlUsed(st){ return st.bal>0? core(Object.assign({},st,{bal:0}),0).total-core(st,0).total : 0; }
function idecoSave(st){ return st.ideco>0? core(Object.assign({},st,{ideco:0}),0).total-core(st,0).total : 0; }

/* 配偶者のパート（kabe.htmlと同じ計算） */
const GR=[[63000,58000],[73000,68000],[83000,78000],[93000,88000],[101000,98000],[107000,104000],[114000,110000],[122000,118000],[130000,126000],[138000,134000],[146000,142000],[155000,150000],[165000,160000],[175000,170000],[185000,180000],[195000,190000],[210000,200000],[230000,220000],[250000,240000],[270000,260000],[290000,280000],[310000,300000],[Infinity,320000]];
const hyojun=p=>{for(const [l,g] of GR){ if(p<l) return g; }};
function spouse(w,mode,a40){
  const g=Math.max(0,w-kyuyo(w));
  let sh=0,kind='none';
  if(w>0){
    if(mode==='yes'){ const s=hyojun(w/12); sh=12*(Math.max(s,58000)*(0.04925+(a40?0.0081:0)+0.00115)+Math.max(s,88000)*0.0915)+w*0.005; kind='emp'; }
    else if(w<(a40===2?1800000:1300000)) kind='dep';
    else { sh=Math.max(0,g-430000)*(0.0751+0.0280+0.0027+(a40?0.0243:0))+47600+17600+1873+(a40?17800:0)+(a40===2?0:17920*12); kind='kokuho'; }
  }
  const it=incomeTax(g-sh-kisoI(g)), jt=juminSimple(g,sh,0,50000);
  return {g,sh,kind,it,jt,net:w-sh-it-jt};
}
/* 大学生の子のバイト（daigakusei-oyaと同じ計算） */
function student(w){
  const g=Math.max(0,w-kyuyo(w)), kinro=g<=890000;
  const kokuho=w>=1500000?Math.max(0,g-430000)*(0.0751+0.0280+0.0027)+47600+17600+1873:0;
  const it=incomeTax(g-kokuho-kisoI(g)-(kinro?270000:0));
  const jt=kinro?0:juminSimple(g,kokuho,0,50000);
  return {g,kokuho,it,jt,kinro,net:w-kokuho-it-jt};
}
/* iDeCoの掛金の上限（月額） */
function idecoCap(year,type,other){
  other=Math.max(0,other||0);
  if(year===2027) return type==='emp'?62000:type==='gov'?54000:Math.max(0,Math.floor((62000-other)/1000)*1000);
  return type==='emp'?23000:type==='gov'?20000:Math.max(0,Math.min(20000,Math.floor((55000-other)/1000)*1000));
}
const HOUSE={nintei_new:[45000000,50000000],zeh_new:[35000000,45000000],sho_new:[20000000,30000000],nintei_old:[35000000,45000000],zeh_old:[35000000,45000000],sho_old:[20000000,30000000],other_old:[20000000,20000000]};

/* ===== 部品の一覧（トップページの表と同じ並び） ===== */
const MODS={
  furusato:{name:'ふるさと納税',short:'ふるさと納税'},
  ideco:{name:'iDeCo',short:'iDeCo'},
  jutaku:{name:'住宅ローン控除',short:'住宅ローン控除'},
  kabe:{name:'パートの年収の壁（配偶者）',short:'配偶者のパート'},
  baito:{name:'大学生の子のバイト',short:'子のバイト'}
};
const ORDER=['furusato','ideco','jutaku','kabe','baito'];

/* 1つの状態から、全部の答えを出す */
function evaluate(inp,mods){
  const has=k=>mods.includes(k);
  const sp=has('kabe')? spouse(inp.wife,inp.wmode,inp.wage) : null;
  const stu=has('baito')? student(inp.baito) : null;
  const capM=has('ideco')? idecoCap(inp.year,inp.work,inp.other) : 0;
  const st={inc:inp.inc,kou:inp.kou,dai:inp.dai,
    gw: has('kabe')? sp.g : (inp.sp?0:null),
    gs: has('baito')? stu.g : null,
    ideco: has('ideco')? Math.min(inp.ideco,capM)*12 : 0,
    bal: has('jutaku')? inp.bal : 0,
    capB: HOUSE[inp.house][inp.kosodate?1:0],
    fmode: has('jutaku')&&has('furusato')? inp.fmode : 'onestop'};
  const r={st,sp,stu,capM,c:core(st,0),net:net(st)};
  if(has('furusato')) r.lim=furuLimit(st);
  if(has('ideco')) r.save=idecoSave(st);
  if(has('jutaku')){ r.used=hlUsed(st); r.C=core(st,0).C; }
  if(has('kabe')){ const st0=Object.assign({},st,{gw:0}); r.net0=net(st0); r.hh=r.net+sp.net; }
  if(has('baito')){ const st0=Object.assign({},st,{gs:0}); r.net0b=net(st0); r.fam=r.net+stu.net+(sp?sp.net:0); }
  // 制度どうしの影響：その制度がないときとくらべる
  const without={ideco:{ideco:0},jutaku:{bal:0},kabe:{gw:0},baito:{gs:0}};
  r.links=[];
  for(const x of ['ideco','jutaku','kabe','baito']){
    if(!has(x)) continue;
    const s0=Object.assign({},st,without[x]);
    if(has('furusato')) r.links.push({from:x,to:'furusato',d:r.lim-furuLimit(s0)});
    if(has('jutaku')&&x!=='jutaku') r.links.push({from:x,to:'jutaku',d:r.used-hlUsed(s0)});
    if(has('ideco')&&(x==='kabe'||x==='baito')) r.links.push({from:x,to:'ideco',d:r.save-idecoSave(s0)});
    if(x==='baito'&&has('kabe')){ const loss=s=>net(Object.assign({},s,{gw:0}))-net(s); r.links.push({from:'baito',to:'kabe',d:loss(st)-loss(s0)}); }
  }
  return r;
}

const API={kyuyo,core,net,burden,furuLimit,hlUsed,idecoSave,spouse,student,idecoCap,evaluate,MODS,ORDER,HOUSE};
if(typeof module!=='undefined'&&module.exports){ module.exports=API; }
root.SEIDO=API;
if(typeof document==='undefined') return;

/* ===== 画面 ===== */
const man=v=>{const s=v<0?'−':'';const m=Math.abs(v)/10000;return s+(m>=100?Math.round(m):Math.round(m*10)/10).toLocaleString('ja-JP')+'万円';};
const yen=v=>{const s=v<0?'−':'';return s+(Math.round(Math.abs(v)/100)*100).toLocaleString('ja-JP')+'円';};
const yen1=v=>Math.round(v).toLocaleString('ja-JP')+'円';
const sel=(id,opts,v)=>'<select id="'+id+'">'+opts.map(([a,b])=>'<option value="'+a+'"'+(String(a)===String(v)?' selected':'')+'>'+b+'</option>').join('')+'</select>';
const range=(id,min,max,step,v)=>'<div class="row"><input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+v+'"><output id="'+id+'Out" for="'+id+'"></output></div>';
const box=(id,label,big)=>'<div'+(big?' class="big"':'')+'><span>'+label+'</span><b id="'+id+'">-</b><small id="'+id+'N"></small></div>';

const CSS='.sd-sec{border-top:1px dashed var(--g3);margin-top:18px;padding-top:6px}.sd-sec>h3{margin:8px 0 0;font-size:16px;color:var(--g)}.sd-sec>h3 small{color:var(--sub);font-weight:400;font-size:12px;margin-left:6px}.sd-max{font:inherit;font-size:14px;border:1px solid var(--g);background:#fff;color:var(--g);border-radius:999px;padding:4px 12px;cursor:pointer;white-space:nowrap}.sd-max[aria-pressed=true]{background:var(--g);color:#fff}.sd-links{background:#FFF4E0;border:1px solid #F1D19A;border-radius:10px;padding:10px 12px;margin-top:14px}.sd-links h3{margin:0 0 4px;font-size:15px;color:#8A4B0F}.sd-links ul{margin:0;padding-left:1.2em}.sd-links li{margin:4px 0}.sd-out{margin-top:20px}.sd-out h3{font-size:16px;margin:16px 0 0}details.sd-sweep{margin-top:10px}details.sd-sweep summary{cursor:pointer;color:var(--g);font-weight:700}';

function init(){
  const sec=document.getElementById('calc'); if(!sec||!sec.dataset.mods) return;
  const mods=sec.dataset.mods.split(',').filter(k=>MODS[k]);
  const has=k=>mods.includes(k);
  const D=Object.assign({inc:6000000,year:2026,ideco:'cap',wife:1200000,baito:1200000,bal:30000000},JSON.parse(sec.dataset.def||'{}'));
  const st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  const app=document.getElementById('sd-app');
  let h='';
  // 共通：本人と家族
  h+='<div class="sd-sec" style="border:0;margin:0;padding:0"><h3>あなたと家族</h3>';
  h+='<label for="inc">あなたの年収（額面）</label>'+range('inc',1500000,20000000,100000,D.inc);
  h+='<div class="hint">会社員・公務員の、ボーナス込みの1年の給料です。'+(has('kabe')?'家計の中心で働く人（例：夫）の年収を入れてください。':'')+'</div>';
  if(!has('kabe')) h+='<label for="sp">配偶者</label>'+sel('sp',[[0,'いない／共働き（配偶者控除なし）'],[1,'配偶者控除を受けている（配偶者の収入なし）']],0);
  h+='<label for="kou">扶養している16〜18歳の子ども</label>'+sel('kou',[0,1,2,3].map(n=>[n,n+'人']),0);
  h+='<label for="dai">'+(has('baito')?'ほかに扶養している19〜22歳の子ども（下で入れる子をのぞく）':'扶養している19〜22歳の子ども')+'</label>'+sel('dai',[0,1,2,3].map(n=>[n,n+'人']),0);
  h+='</div>';
  if(has('ideco')){
    h+='<div class="sd-sec"><h3>iDeCo<small>条件を入れると上限が出ます</small></h3>';
    h+='<label for="year">計算する年</label>'+sel('year',[[2026,'2026年分（いまの上限）'],[2027,'2027年分（2027年1月からの新しい上限）']],D.year);
    h+='<label for="work">あなたの働き方</label>'+sel('work',[['emp','会社員（企業年金なし）'],['empdc','会社員（企業年金あり）'],['gov','公務員']],'emp');
    h+='<div id="otherBox" hidden><label for="other">会社の企業年金の掛金（月額）</label><div class="row"><input type="number" id="other" min="0" max="62000" step="1000" value="20000"> 円</div><div class="hint">企業型DCの会社掛金と、DBなどの掛金相当額の合計です。</div></div>';
    h+='<label for="ideco">iDeCoの掛金（月額）</label><div class="row"><input type="range" id="ideco" min="0" max="23000" step="1000" value="0"><output id="idecoOut" for="ideco"></output></div>';
    h+='<div class="row" style="justify-content:space-between;flex-wrap:wrap"><span class="hint" id="capHint"></span><button type="button" class="sd-max" id="idecoMax" aria-pressed="true">上限いっぱいにする</button></div>';
    h+='<div class="hint">最初は上限の額が入っています。上限より少なくしたいときは、つまみを左に動かしてください。</div></div>';
  }
  if(has('jutaku')){
    h+='<div class="sd-sec"><h3>住宅ローン控除</h3>';
    h+='<label for="bal">年末のローン残高</label>'+range('bal',0,50000000,1000000,D.bal);
    h+='<label for="house">家の種類（2026年に住み始める場合）</label>'+sel('house',[['nintei_new','新築：長期優良住宅・低炭素住宅'],['zeh_new','新築：ZEH水準省エネ住宅'],['sho_new','新築：省エネ基準適合住宅'],['nintei_old','中古：長期優良住宅・低炭素住宅'],['zeh_old','中古：ZEH水準省エネ住宅'],['sho_old','中古：省エネ基準適合住宅'],['other_old','中古：それ以外の住宅']],'zeh_new');
    h+='<label for="kosodate">子育て・若者夫婦世帯？</label>'+sel('kosodate',[[0,'いいえ'],[1,'はい（19歳未満の子がいる、または夫婦のどちらかが40歳未満）']],1);
    if(has('furusato')) h+='<label for="fmode">ふるさと納税の手続き</label>'+sel('fmode',[['onestop','ワンストップ特例（2年目以降、年末調整で住宅ローン控除を受ける人）'],['kakutei','確定申告（住宅ローン控除の1年目など）']],D.fmode||'onestop');
    h+='</div>';
  }
  if(has('kabe')){
    h+='<div class="sd-sec"><h3>配偶者のパート（年収の壁）</h3>';
    h+='<label for="wife">配偶者のパート年収（額面）</label>'+range('wife',0,2500000,10000,D.wife);
    h+='<label for="wmode">配偶者は勤め先の社会保険に入る？</label>'+sel('wmode',[['no','入らない（扶養内・会社が対象外）'],['yes','入る（週20時間以上・対象の会社）']],'no');
    h+='<label for="wage">配偶者の年齢</label>'+sel('wage',[[0,'39歳以下'],[1,'40〜59歳'],[2,'60〜64歳']],1);
    h+='</div>';
  }
  if(has('baito')){
    h+='<div class="sd-sec"><h3>大学生の子のバイト（19〜22歳）</h3>';
    h+='<label for="baito">子のバイト代（1年・額面）</label>'+range('baito',0,2500000,10000,D.baito);
    h+='<div class="hint">扶養している19〜22歳の子1人分です。</div></div>';
  }
  // 答え
  h+='<div class="sd-out" aria-live="polite">';
  const outs=[];
  if(has('furusato')) outs.push(['furusato','<div class="res">'+box('oLim','ふるさと納税：2,000円の負担で済む寄付の上限（目安）',true)+box('oSafe','少し控えめにするなら')+box('oBase','あなたの所得税＋住民税（寄付する前）')+'</div>']);
  if(has('ideco')) outs.push(['ideco','<div class="res">'+box('oSave','iDeCoで1年に減る税金（所得税＋住民税）',!has('furusato'))+box('oCap','あなたのiDeCoの上限（月額）')+box('oRatio','掛金の何割が税金で戻る？')+'</div>']);
  if(has('jutaku')) outs.push(['jutaku','<div class="res">'+box('oUsed','住宅ローン控除で実際に戻る額（この年）',!has('furusato')&&!has('ideco'))+box('oC','住宅ローン控除の上限（この年）')+box('oUnused','引ききれずに消える額')+'</div>']);
  if(has('kabe')) outs.push(['kabe','<div class="res">'+box('oHH','夫婦2人の手取りの合計（1年・目安）',!has('furusato')&&!has('ideco')&&!has('jutaku'))+box('oWife','配偶者の手取り')+box('oHdown','配偶者が働くことで、あなたの手取りが減る額')+'</div>']);
  if(has('baito')) outs.push(['baito','<div class="res">'+box('oFam',has('kabe')?'家族の手取りの合計（あなた＋配偶者＋子・1年の目安）':'家族の手取りの合計（親＋子・1年の目安）',!has('furusato')&&!has('ideco')&&!has('jutaku')&&!has('kabe'))+box('oStu','子の手取り')+box('oPdown','子が働くことで、あなたの手取りが減る額')+'</div>']);
  outs.forEach(([k,html],i)=>{ h+=(outs.length>1?'<h3>'+MODS[k].name+'</h3>':'')+html; });
  h+='<div id="alertBox" class="alert" hidden></div>';
  if(mods.length>1) h+='<div class="sd-links"><h3>制度どうしのつながり（この条件で）</h3><ul id="links"></ul></div>';
  h+='<div id="sweeps"></div></div>';
  app.innerHTML=h;

  const $=id=>document.getElementById(id);
  let follow=true;
  function read(){
    return {inc:+$('inc').value,sp:$('sp')?+$('sp').value:0,kou:+$('kou').value,dai:+$('dai').value,
      year:$('year')?+$('year').value:2026,work:$('work')?$('work').value:'emp',other:$('other')?+$('other').value:0,ideco:$('ideco')?+$('ideco').value:0,
      bal:$('bal')?+$('bal').value:0,house:$('house')?$('house').value:'zeh_new',kosodate:$('kosodate')?+$('kosodate').value:1,fmode:$('fmode')?$('fmode').value:'onestop',
      wife:$('wife')?+$('wife').value:0,wmode:$('wmode')?$('wmode').value:'no',wage:$('wage')?+$('wage').value:1,baito:$('baito')?+$('baito').value:0};
  }
  const set=(id,v,n)=>{ if($(id)){ $(id).textContent=v; if(n!==undefined&&$(id+'N')) $(id+'N').textContent=n; } };
  function linkText(l){
    const amt=Math.abs(l.d);
    const who={ideco:'iDeCoの掛金で',jutaku:'住宅ローン控除で',kabe:'配偶者がパートで働くことで',baito:'子がバイトで働くことで'}[l.from];
    if(l.to==='furusato'){
      if(amt<1000) return who+'、ふるさと納税の上限は<b>ほとんど変わりません</b>。';
      return who+'、ふるさと納税の上限が<b>約'+yen1(Math.round(amt/1000)*1000)+(l.d<0?' 下がって':' 上がって')+'</b>います。';
    }
    if(l.to==='ideco'){
      if(amt<100) return who+'、iDeCoで減る税金は<b>ほとんど変わりません</b>。';
      return who+'、iDeCoで減る税金が<b>約'+yen(amt)+(l.d<0?' 少なく':' 多く')+'</b>なっています（税金のかかり方の段階が変わるため）。';
    }
    if(l.to==='kabe'){
      if(amt<100) return who+'、配偶者のパートで減るあなたの手取りは<b>ほとんど変わりません</b>。';
      return who+'、配偶者のパートで減るあなたの手取りが<b>約'+yen(amt)+(l.d>0?' 多く':' 少なく')+'</b>なっています（税金のかかり方の段階が変わるため）。';
    }
    if(amt<100) return who+'、住宅ローン控除で戻る額は<b>変わりません</b>。';
    return who+'、住宅ローン控除で戻る額が<b>約'+yen(amt)+(l.d<0?' 減って':' ふえて')+'</b>います'+(l.d<0?'（引ききれずに消える分がふえる）':'')+'。';
  }
  function sweep(inp,key,label,steps,fmt){
    let rows='';
    const cols=[];
    if(key!=='ideco'&&has('ideco')) cols.push(['iDeCoで減る税金',r=>yen(r.save)]);
    if(key==='ideco') cols.push(['減る税金（年）',r=>yen(r.save)]);
    if(has('jutaku')) cols.push(['住宅ローン控除で戻る額',r=>yen(r.used)]);
    if(key==='kabe') cols.push(['夫婦の手取り',r=>man(r.hh)]);
    if(key==='baito') cols.push(['家族の手取り',r=>man(r.fam)]);
    if(has('furusato')) cols.push(['ふるさと納税の上限',r=>yen1(r.lim)]);
    for(const v of steps){ const o=Object.assign({},inp); o[key]=v; const r=evaluate(o,mods); rows+='<tr'+(v===inp[key]?' style="background:#FFF4E0"':'')+'><th scope="row" style="white-space:nowrap">'+fmt(v)+'</th>'+cols.map(c=>'<td class="n">'+c[1](r)+'</td>').join('')+'</tr>'; }
    return '<details class="sd-sweep"><summary>'+label+'を動かすと、ほかの答えはこう変わる（表）</summary><div style="overflow-x:auto"><table><thead><tr><th scope="col">'+label+'</th>'+cols.map(c=>'<th scope="col">'+c[0]+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div></details>';
  }
  let openSweeps=new Set();
  function update(src){
    const inp=read();
    if(has('ideco')){
      $('otherBox').hidden=inp.work!=='empdc';
      const cap=idecoCap(inp.year,inp.work,inp.other), sl=$('ideco');
      if(src==='ideco') follow=+sl.value>=cap;
      sl.max=cap; if(follow) sl.value=cap; else if(+sl.value>cap) sl.value=cap;
      inp.ideco=+sl.value;
      $('idecoMax').setAttribute('aria-pressed',String(follow));
      $('capHint').textContent='あなたの上限：月'+yen1(cap)+(inp.year===2027?'（2027年1月から）':'（2026年分）');
      $('idecoOut').textContent=yen1(inp.ideco);
    }
    $('incOut').textContent=man(inp.inc);
    if($('bal')) $('balOut').textContent=man(inp.bal);
    if($('wife')) $('wifeOut').textContent=man(inp.wife);
    if($('baito')) $('baitoOut').textContent=man(inp.baito);
    const r=evaluate(inp,mods), msg=[];
    if(has('furusato')){
      set('oLim',r.lim>2000?'約'+yen1(r.lim):'ほぼ0円',r.lim>2000?'このうち'+yen1(r.lim-2000)+'が税金から引かれ、自己負担は2,000円です':'税金がほとんどかからないため、ふるさと納税で得になる額はほぼありません');
      set('oSafe',r.lim>2000?'約'+yen1(Math.floor(r.lim*0.9/1000)*1000):'-','上限の9割。見込みがずれても安心な額');
      set('oBase',yen(r.c.total+5000),'所得税 '+yen(r.c.IT)+'＋住民税 '+yen(r.c.JT+5000));
    }
    if(has('ideco')){
      set('oSave','約'+yen(r.save),'掛金 月'+yen1(inp.ideco)+'（1年で'+man(inp.ideco*12)+'）の場合'+(has('jutaku')?'。住宅ローン控除が引ききれなくなる分を差し引いた、実際に減る額です':''));
      set('oCap',yen1(r.capM),inp.year===2027?'2027年1月の引き落とし分から':'2026年分（2027年からは上がります）');
      set('oRatio',inp.ideco>0?Math.round(r.save/(inp.ideco*12)*100)+'%':'-','所得税と住民税の税率で決まります');
      if(inp.ideco>0&&r.save<1) msg.push('この年収では所得税・住民税がほとんどかからないため、iDeCoで減る税金はほぼありません。');
    }
    if(has('jutaku')){
      const un=Math.max(0,r.C-r.used);
      set('oUsed','約'+yen(r.used),'所得税から引き、引ききれない分を住民税から引きます');
      set('oC',yen(r.C),'年末の残高（限度額まで）の0.7%');
      set('oUnused',un>500?'約'+yen(un):'0円',un>500?'所得税と住民税から引ききれず、使えずに消えます':'全部使いきれています');
    }
    if(has('kabe')){
      const kn={none:'',dep:'あなたの扶養なので社会保険料はかかりません',emp:'勤め先の社会保険料',kokuho:(inp.wage===2?'国民健康保険':'国民年金＋国民健康保険')}[r.sp.kind];
      set('oHH','約'+man(r.hh),'あなた '+man(r.net)+'＋配偶者 '+man(r.sp.net));
      set('oWife','約'+man(r.sp.net),(r.sp.sh?kn+' '+yen(r.sp.sh)+'／年、':kn+(kn?'。':''))+'所得税 '+yen(r.sp.it)+'、住民税 '+yen(r.sp.jt));
      const d=r.net0-r.net; set('oHdown',d>50?'約'+yen(d):'0円',d>50?'配偶者控除・配偶者特別控除が少なくなるため':'この年収では、あなたの税金は変わりません');
    }
    if(has('baito')){
      set('oFam','約'+man(r.fam),'あなた '+man(r.net)+(r.sp?'＋配偶者 '+man(r.sp.net):'')+'＋子 '+man(r.stu.net));
      set('oStu','約'+man(r.stu.net),(r.stu.kokuho?'国民健康保険 '+yen(r.stu.kokuho)+'、':'親の健康保険の扶養のまま、')+'所得税 '+yen(r.stu.it)+'、住民税 '+yen(r.stu.jt));
      const d=r.net0b-r.net; set('oPdown',d>50?'約'+yen(d):'0円',d>50?'特定扶養控除が特定親族特別控除に変わり、少なくなるため':'あなたの控除は変わりません');
    }
    if(has('jutaku')&&has('furusato')&&inp.fmode==='kakutei'){ const l=r.links.find(l=>l.from==='jutaku'&&l.to==='furusato'); if(l&&l.d<-3000) msg.push('住宅ローン控除で税金がほとんど0になっているため、ふるさと納税の上限が下がっています。サイトの一般的なシミュレーションの額で寄付すると、自己負担が2,000円をこえることがあります。'); }
    if($('links')) $('links').innerHTML=r.links.map(l=>'<li>'+linkText(l)+'</li>').join('')||'<li>この条件では、制度どうしの影響はほとんどありません。</li>';
    const al=$('alertBox'); al.hidden=!msg.length; al.textContent=msg.join(' ');
    // 動かして比べる表
    const sw=$('sweeps'); sw.querySelectorAll('details').forEach(d=>{ if(d.open) openSweeps.add(d.dataset.k); else openSweeps.delete(d.dataset.k); });
    let s='';
    if(has('ideco')){ const cap=r.capM; const st=[0,5000,10000,15000,20000,23000,30000,40000,50000,54000,62000].filter(v=>v<cap); st.push(cap); if(!st.includes(inp.ideco)) st.push(inp.ideco); st.sort((a,b)=>a-b); s+=sweep(inp,'ideco','iDeCoの掛金（月額）',st,v=>yen1(v)).replace('<details','<details data-k="ideco"'); }
    if(has('kabe')){ const st=[0,1000000,1100000,1190000,1290000,1300000,1360000,1500000,1690000,1780000,2070000,2500000]; if(!st.includes(inp.wife)) st.push(inp.wife); st.sort((a,b)=>a-b); s+=sweep(inp,'wife','配偶者の年収',st,v=>man(v)).replace('<details','<details data-k="kabe"'); }
    if(has('baito')){ const st=[0,1030000,1190000,1300000,1360000,1500000,1690000,1970000,2200000]; if(!st.includes(inp.baito)) st.push(inp.baito); st.sort((a,b)=>a-b); s+=sweep(inp,'baito','子のバイト代',st,v=>man(v)).replace('<details','<details data-k="baito"'); }
    if(has('jutaku')){ const st=[0,10000000,20000000,30000000,40000000,50000000]; if(!st.includes(inp.bal)) st.push(inp.bal); st.sort((a,b)=>a-b); s+=sweep(inp,'bal','年末のローン残高',st,v=>man(v)).replace('<details','<details data-k="jutaku"'); }
    sw.innerHTML=s; sw.querySelectorAll('details').forEach(d=>{ if(openSweeps.has(d.dataset.k)) d.open=true; });
  }
  app.addEventListener('input',e=>update(e.target.id));
  app.addEventListener('change',e=>update(e.target.id));
  if($('idecoMax')) $('idecoMax').addEventListener('click',()=>{ follow=true; update('max'); });
  if(has('ideco')&&D.ideco!=='cap'){ follow=false; $('ideco').max=62000; $('ideco').value=D.ideco; }
  update('init');
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})(typeof window!=='undefined'?window:globalThis);
