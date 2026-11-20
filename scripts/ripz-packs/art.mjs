import {createRequire} from 'module';const {chromium}=createRequire('/')('playwright');
const PACKS=[['gold','Push-ups','FFC65A,F5A623,B86A08'],['blue','Squats','7CC4FF,2F8BFF,0B4FB3'],['green','Sit-ups','8CF0B0,27C46B,0C7A3C'],['red','Lunges','FF9A8A,F0472F,A31A0A'],['purple','Mountain climbers','D0A6FF,9052F0,5320A8'],['steel','Wild card','F1F4F8,AEB7C2,5F6B78']];
const b=await chromium.launch({args:['--allow-file-access-from-files']});const p=await b.newPage({viewport:{width:1024,height:1623}});
const base='file://'+process.cwd()+'/pk3d/art.html';
for(const [id,label,c] of PACKS){await p.goto(`${base}?id=${id}&label=${encodeURIComponent(label)}&c=${c}`);await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:`pk3d/art/${id}.png`,omitBackground:true});}
await p.goto(`${base}?id=x&label=x&c=fff,fff,fff&mode=mask`);await p.screenshot({path:'pk3d/art/mask.png',omitBackground:true});
await b.close();console.log('art ok');
