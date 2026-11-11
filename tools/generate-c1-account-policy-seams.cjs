// Maintainer-only generation of a NEW reviewed inverse fixture. Never run by
// prebuild/build or an application request. Does not alter old oracle fixtures.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {restore,blob}=require('./c1-account-policy-seams.cjs');
const filename='tools/fixtures/c1-account-policy-source-seams.json';
const fixture=JSON.parse(fs.readFileSync(filename,'utf8'));
assert.equal(fixture.baselineCommit,'095da15d8d02cdecff5725f1c206047b48e5def4','Only the reviewed pre-v2 baseline is allowed');
if(process.argv.includes('--write')){
 const script=String.raw`
import difflib, hashlib, json, pathlib, subprocess
target=pathlib.Path('tools/fixtures/c1-account-policy-source-seams.json')
meta=json.loads(target.read_text())
base=meta['baselineCommit']
def git(*args):
 return subprocess.run(['git',*args],check=True,stdout=subprocess.PIPE).stdout
def blob(s):
 b=s.encode();return hashlib.sha1(('blob '+str(len(b))+'\0').encode()+b).hexdigest()
paths=git('diff','--name-only',base,'--','lib','components','pages','styles','tools/generate-c1-recent-momentum-challenger.cjs').decode().splitlines()
files={}
for path in sorted(paths):
 old=subprocess.run(['git','show',base+':'+path],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 if old.returncode:continue
 before=old.stdout.decode();after=pathlib.Path(path).read_text()
 if before==after:continue
 a=before.splitlines(keepends=True);b=after.splitlines(keepends=True)
 chunks=[]
 for group in difflib.SequenceMatcher(None,a,b,autojunk=False).get_grouped_opcodes(6):
  start,end=group[0],group[-1]
  chunks.append({'before':''.join(a[start[1]:end[2]]),'after':''.join(b[start[3]:end[4]])})
 # Rare repeated context uses an exact whole-file inverse, never a fuzzy patch.
 if any(not c['after'] or after.count(c['after'])!=1 for c in chunks):chunks=[{'before':before,'after':after}]
 restored=after
 for c in reversed(chunks):
  assert restored.count(c['after'])==1,path
  restored=restored.replace(c['after'],c['before'])
 assert restored==before,path
 files[path]={'beforeHash':blob(before),'afterHash':blob(after),'chunks':chunks}
meta['files']=files
target.write_text(json.dumps(meta,indent=2)+'\n')
print('Generated exact v2 source inverses for '+str(len(files))+' existing files; review this NEW fixture before release.')
`;
 const result=spawnSync('python',['-c',script],{encoding:'utf8'});
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 assert.equal(result.status,0,'Generate reviewed v2 inverse fixture');
}else if(process.argv.includes('--check')){
 for(const [file,patch]of Object.entries(fixture.files)){
  const source=require('./c1-opening-shared-seams.cjs').restore(file,fs.readFileSync(file,'utf8'));
  const inputSource=require('./c1-opening-revision-inputs-seams.cjs').restoreCurrent(file,source);
  const monitoringSource=require('./c1-watch-monitoring-seams.cjs').restore(file,inputSource);
  const watchSource=require('./c1-current-watch-ten-seams.cjs').restore(file,monitoringSource);
  const releasedSource=require('./c1-account-policy-replay-repair-seams.cjs').restore(file,watchSource);
  assert.equal(blob(releasedSource),patch.afterHash,'Current source reverses to reviewed released v2 source: '+file);
  assert.equal(blob(restore(file,source)),patch.beforeHash,'Retained pre-v2 source: '+file);
 }
 console.log('PASS: every declared v2 inverse restores its exact pre-v2 source ('+Object.keys(fixture.files).length+' files).');
}else throw Error('Use --write for explicit maintainer generation or --check for validation');
