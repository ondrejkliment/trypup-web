const sharp = require('sharp');
function head(x,y,s,dark){ // dark=true → tmavé pozadí → krémová hlava-mark
  const ear = dark ? '#FDF4EF' : '#4A2B45';
  const eye = dark ? '#4A2B45' : '#4A2B45';
  return `<g transform="translate(${x},${y}) scale(${s})">
   <ellipse cx="48" cy="112" rx="20" ry="52" transform="rotate(-10 48 112)" fill="${ear}"/>
   <ellipse cx="152" cy="112" rx="20" ry="52" transform="rotate(10 152 112)" fill="${ear}"/>
   <ellipse cx="100" cy="92" rx="58" ry="54" fill="#C77A45"/>
   <ellipse cx="68" cy="80" rx="32" ry="34" fill="#9A5A2E" clip-path="url(#hc)"/>
   <ellipse cx="100" cy="127" rx="38" ry="31" fill="#FDF4EF" stroke="#B0682F" stroke-width="2.5"/>
   <circle cx="78" cy="86" r="9" fill="${eye}"/><circle cx="122" cy="86" r="9" fill="${eye}"/>
   <circle cx="81" cy="83" r="3" fill="#FDF4EF"/><circle cx="125" cy="83" r="3" fill="#FDF4EF"/>
   <path d="M89 113 Q100 106 111 113 Q111 123 100 127 Q89 123 89 113 Z" fill="${eye}"/>
   <path d="M100 127 V134" stroke="${eye}" stroke-width="3.2" stroke-linecap="round"/>
   <path d="M100 134 Q90 143 82 137" stroke="${eye}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
   <path d="M100 134 Q110 143 118 137" stroke="${eye}" stroke-width="3.2" fill="none" stroke-linecap="round"/></g>`;
}
function wm(x,y,size,tryc){ return `<text x="${x}" y="${y}" font-size="${size}" font-weight="800"><tspan fill="${tryc}">try</tspan><tspan fill="#F2784B">pup</tspan></text>`; }
function lines(arr,x,y,size,fill,lh){ return arr.map((l,i)=>`<text x="${x}" y="${y+i*lh}" font-size="${size}" font-weight="800" fill="${fill}">${l}</text>`).join(''); }

// {file, bg, dark, head/wm colors, headline[], hc[], accentIdx, sub[], subc, stripe}
const P = [
 {f:'post-zavazek', bg:'#4A2B45', dark:true, wmTry:'#F7C9B0', stripe:'#F2784B',
   hl:['Pes není dárek.','Je to závazek','na 10–15 let.'], hc:'#FDF4EF', acc:2, accc:'#F2784B',
   sub:['Roztomilost vyprchá. Povinnosti zůstanou —','každý den, celá léta.'], subc:'#E9DCE4'},
 {f:'post-nemamcas', bg:'#F7C9B0', dark:false, wmTry:'#4A2B45', stripe:'#4A2B45',
   hl:['„Nemám čas."','Důvod č. 1,','proč psi končí','v útulku.'], hc:'#4A2B45', acc:3, accc:'#B8531F',
   sub:['A přitom je to jediné, co se dá','spočítat předem.'], subc:'#6E4A2E'},
 {f:'post-333', bg:'#FDF4EF', dark:false, wmTry:'#4A2B45', stripe:'#4A2B45',
   hl:['Pravidlo 3-3-3','pro psa z útulku'], hc:'#4A2B45', acc:-1, accc:'#F2784B',
   sub:['3 dny v šoku · 3 týdny na zvyknutí ·','3 měsíce, než se cítí doma. Buď trpělivý.'], subc:'#6E6A56', bullets:true},
 {f:'post-adopt-give', bg:'#3E7C8C', dark:true, wmTry:'#DCE9ED', stripe:'#F2784B',
   hl:['Adoptovaný pes','ti dá víc,','než čekáš.'], hc:'#FDF4EF', acc:-1, accc:'#FDF4EF',
   sub:['Znáš jeho povahu, je očkovaný a čipovaný —','a ty zachráníš život.'], subc:'#DCE9ED'},
 {f:'post-tryit', bg:'#FDF4EF', dark:false, wmTry:'#4A2B45', stripe:'#4A2B45',
   hl:['Vyzkoušej si to.','Nanečisto.'], hc:'#4A2B45', acc:1, accc:'#F2784B',
   sub:['Celá péče o psa — procházky, krmení, výcvik,','náklady. Bez následků pro živé zvíře.'], subc:'#6E6A56'},
];
const jobs=[];
for(const p of P){
  const headl = p.hl.map((l,i)=>`<text x="80" y="${380+i*98}" font-size="84" font-weight="800" fill="${i===p.acc?p.accc:p.hc}">${l}</text>`).join('');
  const subY = 380 + p.hl.length*98 + 50;
  const subt = p.sub.map((l,i)=>`<text x="82" y="${subY+i*50}" font-size="34" font-weight="${p.bullets?'400':'400'}" fill="${p.subc}">${l}</text>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" font-family="Helvetica, Arial, sans-serif"><defs><clipPath id="hc"><ellipse cx="100" cy="92" rx="58" ry="54"/></clipPath></defs>
  <rect width="1080" height="1080" fill="${p.bg}"/><rect width="1080" height="14" fill="${p.stripe}"/>
  ${head(80,68,0.42,p.dark)}${wm(165,118,44,p.wmTry)}
  ${headl}${subt}
  <text x="80" y="1015" font-size="30" font-weight="700" fill="${p.dark?'#FDF4EF':'#4A2B45'}">trypup.life</text>
  <text x="1000" y="1015" text-anchor="end" font-size="30" font-weight="600" fill="${p.dark?'#C9B8C2':'#8A7E84'}">@trypupapp</text></svg>`;
  jobs.push([svg, `../docs/social/img/${p.f}.png`]);
}
(async()=>{ for(const [svg,o] of jobs){ await sharp(Buffer.from(svg),{density:144}).resize(1080,1080).png().toFile(o); console.log('OK',o.split('/').pop()); } })();
