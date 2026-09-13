const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.cwd(),manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/c1-release-freeze.json'),'utf8'));
const errors=[];
for(const [file,expected] of Object.entries(manifest.files)){
 try{const data=fs.readFileSync(path.join(root,file));const actual=crypto.createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');if(actual!==expected)errors.push(file+' changed');}
 catch{errors.push(file+' missing');}
}
function visit(dir){if(!fs.existsSync(path.join(root,dir)))return;for(const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const file=dir+'/'+item.name;if(item.isDirectory())visit(file);else if(!Object.hasOwn(manifest.files,file))errors.push(file+' added');}}
for(const dir of ['lib','components','pages','styles'])visit(dir);
if(errors.length){console.error('C1 release freeze failed:\n'+errors.join('\n')+'\nRead AGENTS.md. A new explicit owner instruction is required for strategy/UI changes. Do not refresh hashes merely to pass the build.');process.exitCode=1;}
else console.log('PASS: C1 application matches the approved release freeze ('+manifest.baselineCommit.slice(0,7)+').');
