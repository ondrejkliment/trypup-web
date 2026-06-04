const sharp = require('sharp');
const fs = require('fs');

const HEAD = `<g transform="translate(80,68) scale(0.42)">
  <ellipse cx="48" cy="112" rx="20" ry="52" transform="rotate(-10 48 112)" fill="#4A2B45"/>
  <ellipse cx="152" cy="112" rx="20" ry="52" transform="rotate(10 152 112)" fill="#4A2B45"/>
  <ellipse cx="100" cy="92" rx="58" ry="54" fill="#C77A45"/>
  <ellipse cx="68" cy="80" rx="32" ry="34" fill="#9A5A2E" clip-path="url(#hc)"/>
  <ellipse cx="100" cy="127" rx="38" ry="31" fill="#FDF4EF" stroke="#B0682F" stroke-width="2.5"/>
  <circle cx="78" cy="86" r="9" fill="#4A2B45"/><circle cx="122" cy="86" r="9" fill="#4A2B45"/>
  <circle cx="81" cy="83" r="3" fill="#FDF4EF"/><circle cx="125" cy="83" r="3" fill="#FDF4EF"/>
  <path d="M89 113 Q100 106 111 113 Q111 123 100 127 Q89 123 89 113 Z" fill="#4A2B45"/>
  <path d="M100 127 V134" stroke="#4A2B45" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M100 134 Q90 143 82 137" stroke="#4A2B45" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <path d="M100 134 Q110 143 118 137" stroke="#4A2B45" stroke-width="3.2" fill="none" stroke-linecap="round"/>
</g>
<text x="165" y="118" font-size="44" font-weight="800"><tspan fill="#4A2B45">try</tspan><tspan fill="#F2784B">pup</tspan></text>`;

function wrap(lines, x, y, size, fill, lh){
  return lines.map((l,i)=>`<text x="${x}" y="${y+i*lh}" font-size="${size}" font-weight="800" fill="${fill}">${l}</text>`).join('\n');
}

// slides: cover, 4 questions, cta
const slides = [
  {bg:'#4A2B45', kicker:'KARUSEL · ulož si', kc:'#F7C9B0', lines:['Než si pořídíš','psa, odpověz','si na tohle 👇'], lc:'#FDF4EF', accent:['skutečně.'], ac:'#F2784B', foot:'#F7C9B0'},
  {bg:'#FDF4EF', num:'1', lines:['Kde budeš','za 5 let?'], lc:'#4A2B45', sub:'Stěhování, práce, cestování — pes musí do plánů zapadnout.'},
  {bg:'#FDF4EF', num:'2', lines:['Kdo se postará,','když onemocníš?'], lc:'#4A2B45', sub:'Pes potřebuje péči každý den, bez výjimky. Máš záložní plán?'},
  {bg:'#FDF4EF', num:'3', lines:['Zvládneš to','finančně 15 let?'], lc:'#4A2B45', sub:'Nejen teď — celý život psa. Krize, ztráta práce, drahá veterina.'},
  {bg:'#FDF4EF', num:'4', lines:['Máš čas i ve','špatném počasí?'], lc:'#4A2B45', sub:'Procházky 2× denně. I když prší, i když se ti nechce.'},
  {bg:'#3E7C8C', cta:true, lines:['Nejsi si jistý?'], lc:'#FDF4EF', sub:'Vyzkoušej si péči o psa nanečisto — bez následků pro živé zvíře.', subc:'#E7F0F2', url:'trypup.life · @trypupapp'},
];

const out=[];
slides.forEach((s,idx)=>{
  let body='';
  const headFill = s.bg==='#FDF4EF' ? HEAD : HEAD.replace(/fill="#4A2B45"/g,'fill="#FDF4EF"').replace('fill="#C77A45"','fill="#C77A45"');
  if(s.kicker){ // cover
    body = `${headFill}
    <text x="80" y="430" font-size="34" font-weight="700" fill="${s.kc}" letter-spacing="3">${s.kicker.toUpperCase()}</text>
    ${wrap(s.lines,80,540,96,s.lc,110)}
    <text x="80" y="${540+s.lines.length*110}" font-size="96" font-weight="800" fill="${s.ac}">${s.accent[0]}</text>`;
  } else if(s.cta){
    body = `${headFill}
    ${wrap(s.lines,80,560,100,s.lc,110)}
    <text x="80" y="700" font-size="40" font-weight="400" fill="${s.subc}">${s.sub.slice(0,38)}</text>
    <text x="80" y="752" font-size="40" font-weight="400" fill="${s.subc}">${s.sub.slice(38)}</text>
    <g transform="translate(80,860)"><rect width="430" height="92" rx="46" fill="#F2784B"/><text x="215" y="59" text-anchor="middle" font-size="36" font-weight="800" fill="#FDF4EF">Stáhni trypup</text></g>
    <text x="80" y="1015" font-size="30" font-weight="700" fill="${s.lc}">${s.url}</text>`;
  } else { // question
    body = `${headFill}
    <text x="80" y="300" font-size="150" font-weight="800" fill="#F2784B" opacity="0.25">${s.num}</text>
    ${wrap(s.lines,80,470,84,s.lc,98)}
    <text x="82" y="${470+s.lines.length*98+40}" font-size="38" font-weight="400" fill="#6E6A56">${s.sub.slice(0,40)}</text>
    <text x="82" y="${470+s.lines.length*98+92}" font-size="38" font-weight="400" fill="#6E6A56">${s.sub.slice(40)}</text>
    <text x="1000" y="1015" text-anchor="end" font-size="28" font-weight="600" fill="#8A7E84">${idx}/5 · @trypupapp</text>`;
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" font-family="Helvetica, Arial, sans-serif"><defs><clipPath id="hc"><ellipse cx="100" cy="92" rx="58" ry="54"/></clipPath></defs><rect width="1080" height="1080" fill="${s.bg}"/><rect width="1080" height="14" fill="${s.bg==='#FDF4EF'?'#4A2B45':'#F2784B'}"/>${body}</svg>`;
  out.push([svg, `../docs/social/img/carousel-otazky-${idx}.png`]);
});

(async()=>{ for(const [svg,o] of out){ await sharp(Buffer.from(svg),{density:144}).resize(1080,1080).png().toFile(o); console.log('OK',o.split('/').pop()); } })();
