import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Run on the owner's computer. Authentication stays in the official Vercel CLI.
// This helper accepts only the current Breuer project and its verified team.
const root=fileURLToPath(new URL('../',import.meta.url));
const target={name:'breuer-grand-prix-final',id:'prj_ed4SbzEGOGAws5Lm2luQ24Awwgwr',teamId:'team_rjF6K4vZdLABiJagqlfolPau',scope:'luca-s-projects6'};
const windows=process.platform==='win32';
function vercel(args,{capture=false}={}){
 const result=spawnSync(windows?'npx.cmd':'npx',['--yes','vercel@64.0.1',...args],{
  cwd:root,encoding:'utf8',shell:windows,
  stdio:capture?['inherit','pipe','inherit']:'inherit',
 });
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error('Vercel-Schritt fehlgeschlagen. Veröffentlichung angehalten.');
 return result.stdout?.trim();
}
function verifyProject(text){
 const raw=JSON.parse(text),project=raw.project||raw;
 if((project.id||project.projectId)!==target.id)throw new Error('Unerwartetes Vercel-Projekt. Es wird nichts veröffentlicht.');
 const owner=project.accountId||project.orgId||project.teamId;
 if(owner&&owner!==target.teamId)throw new Error('Unerwartetes Vercel-Team. Es wird nichts veröffentlicht.');
}
try{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 if(pkg.name!=='breuer-grand-prix'||pkg.version!=='3.6.0')throw new Error('Dieser Helfer ist für Breuer Grand Prix 3.6.0 vorgesehen.');
 console.log('\n1/4 · Anmeldung bei Vercel. Bestätige den offiziellen Anmeldedialog.');
 vercel(['login']);
 console.log('\n2/4 · Bestehendes Breuer-Projekt prüfen.');
 verifyProject(vercel(['project','inspect',target.name,'--scope',target.scope,'--format','json','--non-interactive'],{capture:true}));
 console.log('\n3/4 · Diesen Ordner mit dem geprüften Projekt verbinden.');
 vercel(['link','--team',target.teamId,'--project',target.id,'--yes','--non-interactive']);
 const linked=JSON.parse(await readFile(new URL('../.vercel/project.json',import.meta.url),'utf8'));
 if(linked.projectId!==target.id||linked.orgId!==target.teamId)throw new Error('Projektverknüpfung stimmt nicht. Es wird nichts veröffentlicht.');
 verifyProject(vercel(['project','inspect','--scope',target.scope,'--format','json','--non-interactive'],{capture:true}));
 console.log('\n4/4 · Version 3.6 live veröffentlichen. Die CLI zeigt Upload und Build an.');
 vercel(['deploy','--prod','--scope',target.scope,'--yes','--non-interactive']);
 console.log('\nVercel-Deployment abgeschlossen. Öffne die von der CLI bestätigte Spieladresse.');
}catch(error){
 console.error('\n'+error.message);process.exitCode=1;
}
