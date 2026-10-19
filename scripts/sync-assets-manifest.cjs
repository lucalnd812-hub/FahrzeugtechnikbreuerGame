const fs=require('fs'),c=require('crypto');const p='deployment/assets-manifest.json';const m=JSON.parse(fs.readFileSync(p,'utf8'));let n=0;
for(const a of m.assets){if(!fs.existsSync(a.file))continue;const b=fs.readFileSync(a.file);const s=c.createHash('sha1').update(b).digest('hex');if(s!==a.sha||b.length!==a.size){a.sha=s;a.size=b.length;n++;}}
fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n');console.log('manifest updated',n);
