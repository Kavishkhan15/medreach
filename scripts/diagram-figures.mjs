// Curated documentation figures. Plain SVG: no remote fonts, scripts or foreignObject.
// Layout coordinates and labels are version-controlled; models, not database records, are depicted.
const C = { ink:'#12384A', muted:'#4B6575', teal:'#087D8E', blue:'#3268B2', line:'#8EA6B4', border:'#CCDCE5', paper:'#FFFFFF', pale:'#F3F8FB', wash:'#EAF5F5' };
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
class Figure {
  constructor(id, title, subtitle, height) {
    this.id=id; this.height=height;
    this.parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${height}" viewBox="0 0 1600 ${height}" role="img" aria-labelledby="title desc"><title id="title">${escape(title)}</title><desc id="desc">${escape(subtitle)}</desc><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="${C.teal}" stroke-width="1.5"/></marker></defs><rect width="1600" height="${height}" fill="white"/><rect x="1" y="1" width="1598" height="${height-2}" fill="none" stroke="${C.border}"/><path d="M64 46 H112" stroke="${C.teal}" stroke-width="6"/>`];
    this.text(132,53,'MEDREACH  /  ENGINEERING',{size:20,weight:700,color:C.teal,width:1000});
    this.text(64,116,title,{size:44,weight:700,color:C.ink,width:1472});
    this.text(64,160,subtitle,{size:25,width:1472});
  }
  text(x,y,label,{size=24,weight=400,color=C.muted,anchor='start',mono=false,width=1472}={}) {
    this.parts.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" font-family="${mono?'monospace':'Arial, Helvetica, sans-serif'}" text-anchor="${anchor}" data-max-width="${width}">${escape(label)}</text>`);
  }
  rect(x,y,w,h,{fill=C.paper,stroke=C.border,r=14}={}){this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`);}
  path(points,{dash=false,arrow=true,color=C.teal}={}){this.parts.push(`<path d="${points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" ${dash?'stroke-dasharray="8 7"':''} ${arrow?'marker-end="url(#arrow)"':''}/>`);}
  label(x,y,label,width=260){this.rect(x-width/2,y-26,width,36,{fill:C.paper,stroke:C.paper,r:4});this.text(x,y,label,{anchor:'middle',size:22,width:width-12});}
  section(x,y,label){this.text(x,y,label,{size:21,weight:700,color:C.teal,width:1472-x});}
  card(x,y,w,h,title,lines,{accent=C.teal,fill=C.paper,titleSize=30,bodySize=24}={}) {
    this.rect(x,y,w,h,{fill});
    this.parts.push(`<path d="M${x+24} ${y+22} H${x+58}" stroke="${accent}" stroke-width="5" stroke-linecap="round"/>`);
    this.text(x+24,y+64,title,{size:titleSize,weight:700,color:C.ink,width:w-48});
    lines.forEach((label,i)=>this.text(x+24,y+102+i*33,label,{size:bodySize,width:w-48}));
  }
  entity(x,y,w,title,rows) {
    const h=76+rows.length*38;
    this.rect(x,y,w,h);
    this.parts.push(`<path d="M${x+14} ${y} H${x+w-14} Q${x+w} ${y} ${x+w} ${y+14} V${y+65} H${x} V${y+14} Q${x} ${y} ${x+14} ${y}" fill="${C.wash}"/>`);
    this.text(x+22,y+43,title,{size:28,weight:700,color:C.ink,width:w-44});
    rows.forEach(([field,type],i)=>{
      const yy=y+99+i*38;
      this.text(x+22,yy,field,{size:22,mono:true,color:C.ink,width:w-174});
      this.text(x+w-22,yy,type,{size:21,mono:true,anchor:'end',width:146});
    });
    return h;
  }
  finish(note='Implementation view · selected detail · 24 October 2026'){
    this.path([[64,this.height-64],[1536,this.height-64]],{arrow:false,color:C.border});
    this.text(64,this.height-27,note,{size:20,width:1472});
    return {id:this.id,width:1600,height:this.height,svg:this.parts.join('\n')+'</svg>'};
  }
}

function system() {
  const f=new Figure('system-architecture','One product. Three frontends. One API.','Runtime boundaries, shared code and persistent data — without a crawler.',1310);
  f.rect(64,204,1472,288,{fill:C.pale});
  f.section(88,240,'01  PRESENTATION  /  THREE INDEPENDENT NEXT.JS APPLICATIONS');
  const variants=[['Bootstrap 5.3','variants/bootstrap','#7952B3'],['Tailwind CSS 4','variants/tailwind','#087EA4'],['Skeleton CSS 2','variants/skeleton','#526879']];
  variants.forEach(([title,dir,color],i)=>f.card(88+i*488,258,448,122,title,[dir],{accent:color,bodySize:23}));
  f.rect(88,400,1424,68,{fill:C.paper,r:10});
  f.text(112,428,'Shared client contracts: API client, hooks, validation and ranking.',{size:24,weight:700,color:C.ink,width:1368});
  f.text(112,455,'Bootstrap bundles _core; Tailwind and Skeleton use @medreach/core.',{size:22,width:1368});
  f.path([[800,492],[800,580]]);f.text(830,546,'Browser-to-API HTTPS / JSON',{size:23,width:650});
  f.rect(64,580,1472,378,{stroke:C.teal});
  f.section(88,620,'02  SHARED BACKEND  /  EXPRESS');
  f.text(88,661,'Session checks · role and organisation scope · validation · rate limits',{size:25,color:C.ink,width:1424});
  f.card(88,690,448,112,'Discovery',['Hospitals & service directories'],{titleSize:28,bodySize:22});
  f.card(576,690,448,112,'Coordination',['Bed, blood & ambulance requests'],{titleSize:28,bodySize:22});
  f.card(1064,690,448,112,'Platform',['Accounts, Careers & assistant'],{titleSize:28,bodySize:22});
  f.rect(88,824,1424,108,{fill:C.wash,r:10});
  f.text(112,864,'Background work runs inside the API process',{size:27,weight:700,color:C.ink,width:1368});
  f.text(112,903,'Request expiry · notification recovery · durable email delivery',{size:24,width:1368});
  f.path([[520,958],[520,1074]]);f.text(548,1028,'Mongoose / MongoDB',{size:23,width:460});
  f.path([[1288,958],[1288,1074]]);f.text(1315,1028,'Mail adapter',{size:22,width:220});
  f.card(64,1074,952,154,'One shared MongoDB dataset',['Providers · accounts · requests · Careers · audit and delivery state','Existing records and historical provenance remain intact.'],{bodySize:23,fill:C.pale});
  f.card(1080,1074,456,154,'Resend / SMTP',['Configured email transport','Acceptance ≠ inbox receipt'],{titleSize:29,bodySize:22});
  return f.finish('Read with backend/src/app.js and server.js · No separate crawler, Redis queue or worker deployment is required.');
}

function deployment() {
  const f=new Figure('deployment-architecture','Cloud deployment & trust boundaries','Three public Vercel deployments connect to one Railway API and one Atlas dataset.',1390);
  f.rect(64,202,1472,90,{fill:C.pale});f.text(88,238,'BROWSER / MOBILE',{size:21,weight:700,color:C.teal,width:1350});
  f.text(88,272,'Public discovery · regular users · Provider Admins · System Admins',{size:27,color:C.ink,width:1400});
  f.path([[800,292],[800,364]]);f.text(830,340,'HTTPS',{size:23,width:300});
  f.rect(64,364,1472,274,{fill:C.pale});f.section(88,404,'VERCEL  /  INDEPENDENT FRONTEND PROJECTS');
  [['Bootstrap','medreachmumbai.vercel.app'],['Tailwind','medreach-tailwind.vercel.app'],['Skeleton','medreach-skeleton.vercel.app']].forEach(([name,url],i)=>f.card(88+i*488,428,448,184,name,[url,'NEXT_PUBLIC_API_URL','points to the same Railway API'],{titleSize:30,bodySize:22}));
  f.path([[552,638],[552,754]]);f.text(580,700,'Browser-to-API HTTPS',{size:24,width:560});f.text(580,730,'Named CORS origins + cookies',{size:22,width:560});
  f.path([[1320,638],[1320,754]]);f.text(1348,702,'Browser SDK',{size:22,width:186});
  f.card(64,754,976,292,'Railway · one backend service',['medreach-production.up.railway.app','Express REST API + in-process workers','Readiness: /health/ready','Startup: node backend/src/server.js','Server-only credentials stay here.'],{titleSize:32,bodySize:25,fill:C.wash});
  f.card(1104,754,432,142,'Google Maps',['Maps and location UI'],{titleSize:29,bodySize:23});
  f.card(1104,926,432,158,'Resend / SMTP',['Server-side email transport','Selected by configuration'],{titleSize:29,bodySize:22});
  f.path([[1040,1006],[1104,1006]]);
  f.path([[552,1046],[552,1164]]);f.text(580,1117,'MONGODB_URI · TLS',{size:24,width:600});
  f.card(64,1164,976,144,'MongoDB Atlas · shared application data',['Provider records, accounts, requests, Careers and delivery state'],{titleSize:32,bodySize:24,fill:C.pale});
  f.text(1104,1174,'PUBLIC CONFIG',{size:20,weight:700,color:C.teal,width:420});
  f.text(1104,1212,'API URL + restricted Maps key',{size:23,width:420});
  f.text(1104,1255,'PRIVATE CONFIG',{size:20,weight:700,color:C.teal,width:420});
  f.text(1104,1293,'DB, JWT and mail credentials',{size:23,width:420});
  return f.finish('Topology documents the selected hosting arrangement; it does not assert cluster tier, region or replica count.');
}

function careData() {
  const f=new Figure('database-er','Data relationships · care & Careers','Selected Mongoose fields and logical references. Read alongside the account-access view.',1550);
  f.section(64,216,'01  ORGANISATIONS');
  f.entity(64,244,704,'Hospital',[['_id','ObjectId PK'],['name','String'],['location','GeoJSON'],['approvalStatus','enum']]);
  f.entity(832,244,704,'ResourceProvider',[['_id','ObjectId PK'],['kind','enum'],['hospital','ObjectId ?'],['location','GeoJSON']]);
  f.path([[416,472],[416,542],[288,542],[288,620]]);f.text(96,578,'hospital · 1 : n',{size:23,width:440});
  f.path([[1184,472],[1184,534],[800,534],[800,620]]);f.path([[1184,534],[1312,534],[1312,620]]);
  f.label(1184,517,'provider · 1 : n',220);
  f.label(800,580,'optional provider',220);f.label(1312,580,'required provider',230);
  f.entity(64,620,448,'EmergencyRequest',[['_id','ObjectId PK'],['hospital','ObjectId'],['user','ObjectId ?'],['status','enum']]);
  f.entity(576,620,448,'BloodRequest',[['_id','ObjectId PK'],['provider','ObjectId ?'],['user','ObjectId ?'],['type / status','enum']]);
  f.entity(1088,620,448,'AmbulanceBooking',[['_id','ObjectId PK'],['provider','ObjectId'],['user','ObjectId ?'],['status','enum']]);
  f.section(64,932,'02  CAREERS');f.text(64,971,'Applications can target a published job or an organisation directly.',{size:25,width:1472});
  f.path([[288,1046],[288,1013],[800,1013],[800,1046]]);f.text(548,1001,'job · 1 : n',{anchor:'middle',size:22,width:400});
  f.entity(64,1046,448,'Job',[['_id','ObjectId PK'],['hospital/provider','ObjectId'],['createdBy','ObjectId'],['status','enum']]);
  f.entity(576,1046,448,'JobApplication',[['_id','ObjectId PK'],['job','ObjectId'],['applicant','ObjectId'],['status','enum']]);
  f.entity(1088,1046,448,'OrganizationApplication',[['_id','ObjectId PK'],['hospital/provider','ObjectId'],['applicant','ObjectId'],['status','enum']]);
  f.rect(64,1320,1472,154,{fill:C.pale});f.text(88,1363,'REFERENCE NOTES',{size:21,weight:700,color:C.teal,width:1400});
  f.text(88,1403,'user / applicant / createdBy → User. Jobs and direct applications target a hospital or resource provider.',{size:24,width:1400});
  f.text(88,1444,'? = optional. n = zero or more. Arrows show selected references; MongoDB does not enforce SQL foreign keys.',{size:23,width:1400});
  return f.finish('Care coordination and Careers view · Selected fields, not a complete collection inventory or a database migration.');
}

function identityData() {
  const f=new Figure('database-access-er','Data relationships · accounts & provider scope','Assignments connect an account to an organisation; an application alone grants no access.',1280);
  f.entity(64,244,448,'User',[['_id','ObjectId PK'],['email','unique'],['role','enum'],['accountStatus','enum']]);
  f.entity(576,244,448,'ProviderMembership',[['_id','ObjectId PK'],['user','ObjectId'],['kind + organization','key / ref'],['active','Boolean']]);
  f.entity(1088,244,448,'Hospital',[['_id','ObjectId PK'],['name','String'],['admins','User[]'],['approvalStatus','enum']]);
  f.path([[512,352],[576,352]]);f.text(544,334,'1:n',{anchor:'middle',size:21,width:60});
  f.path([[1024,352],[1088,352]],{dash:true});f.text(1056,334,'n:1',{anchor:'middle',size:21,width:60});
  f.path([[1024,428],[1056,428],[1056,860],[1088,860]],{dash:true});
  f.text(1110,613,'kind resolves the target',{size:24,color:C.teal,width:425});
  f.text(1110,649,'hospital → Hospital',{size:23,width:425});
  f.text(1110,685,'other kinds → ResourceProvider',{size:22,width:425});
  f.path([[288,472],[288,810]]);f.text(312,636,'user · 1:n',{size:23,width:350});
  f.path([[512,428],[544,428],[544,925],[576,925]],{dash:true});f.text(590,639,'account reference',{size:23,width:400});
  f.text(590,679,'Created or linked on approval',{size:22,width:410});
  f.entity(64,810,448,'AuthToken',[['_id','ObjectId PK'],['user','ObjectId ?'],['tokenHash','String'],['expiresAt','Date / TTL']]);
  f.entity(576,810,448,'ProviderApplication',[['_id','ObjectId PK'],['kind + organization','key / ref'],['account','ObjectId ?'],['status','enum']]);
  f.entity(1088,810,448,'ResourceProvider',[['_id','ObjectId PK'],['kind','enum'],['hospital','ObjectId ?'],['active','Boolean']]);
  f.rect(64,1082,1472,118,{fill:C.pale});f.text(88,1125,'Scope key: ProviderMembership(user, kind, organization) is unique; only active assignments grant access.',{size:24,color:C.ink,width:1400});
  f.text(88,1166,'Dashed links are optional or kind-resolved. Hospital.admins retains historical assignment compatibility.',{size:23,width:1400});
  return f.finish('Account and onboarding view · Roles: system_admin, provider_admin, user · Approval and activation remain separate.');
}

export function primaryFigures(){return [system(),deployment(),careData(),identityData()];}
