// Build the interaction-bearing ingredient merge map into kg_ingredient_merge_map.
// Scope: ingredient nodes that are endpoints of interaction/PK edges, PubMed
// candidates, or calibration eval runs, and their cross-source duplicate clusters.
// Key: salt-stripped base-name (primary); ATC-5 guardrail (skip conflicting-ATC
// clusters); minerals/vitamins deferred; combination (multi-substance) members
// excluded. Canonical = source preference CPS>DPD>NOC>Summary, then shortest name.
// Consumed by migration 20260624140000_merge_interaction_bearing_duplicates.sql.
//
// Usage: set -a; source .env; set +a
//   K=$SUPABASE_SERVICE_ROLE_KEY U=$EXPO_PUBLIC_SUPABASE_URL/rest/v1 node scripts/build-interaction-merge-map.mjs

const U=process.env.U,KEY=process.env.K;const H={apikey:KEY,Authorization:'Bearer '+KEY,'content-type':'application/json'};
const page=async b=>{const o=[];for(let off=0;;off+=1000){const r=await fetch(U+'/'+b+'&limit=1000&offset='+off,{headers:H});const d=await r.json();if(!Array.isArray(d)||!d.length)break;o.push(...d);if(d.length<1000)break;}return o;};
const SALT=new Set("SODIUM POTASSIUM CALCIUM MAGNESIUM HYDROCHLORIDE HCL HYDROBROMIDE BROMIDE CHLORIDE SULFATE SULPHATE MESYLATE MALEATE TARTRATE BITARTRATE CITRATE PHOSPHATE ACETATE SUCCINATE FUMARATE BESYLATE BESILATE NITRATE OXALATE PAMOATE DECANOATE HYDRATE DIHYDRATE MONOHYDRATE ANHYDROUS DISODIUM TROMETHAMINE MEGLUMINE HEMIFUMARATE".split(" "));
const base=n=>{let s=(n||"").toUpperCase().replace(/\(.*?\)/g," ").replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();const t=s.split(" ").filter(Boolean);while(t.length>1&&SALT.has(t[t.length-1]))t.pop();return t.join(" ");};
const atcOf=n=>{const a=n.identifiers&&n.identifiers.atc;if(!a)return null;return Array.isArray(a)?a[0]:a;};
// deferred mineral/vitamin track (plan: ambiguous, handle separately)
const DEFERRED=new Set("IRON CALCIUM MAGNESIUM ZINC POTASSIUM SODIUM COPPER MANGANESE SELENIUM CHROMIUM MOLYBDENUM IODINE FLUORIDE PHOSPHORUS BORON ASCORBIC ACID FOLIC ACID THIAMINE RIBOFLAVIN NIACIN NIACINAMIDE NICOTINAMIDE PYRIDOXINE BIOTIN PANTOTHENIC ACID CYANOCOBALAMIN METHYLCOBALAMIN HYDROXOCOBALAMIN RETINOL TOCOPHEROL ERGOCALCIFEROL CHOLECALCIFEROL POTASSIUM CHLORIDE".split("  ").join(" ").split(" "));
DEFERRED.add("ASCORBIC ACID");DEFERRED.add("FOLIC ACID");DEFERRED.add("PANTOTHENIC ACID");
const isDeferred=b=>DEFERRED.has(b)||b.startsWith("VITAMIN")||b.startsWith("MULTIVITAMIN")||b.includes("MINERAL");
const isCombo=name=>/\([^)]*,[^)]*\)/.test(name||""); // parenthetical with a comma = multiple substances
const ing=await page('kg_node?type=eq.ingredient&select=id,canonical_name,source,identifiers');
const ingSet=new Set(ing.map(n=>n.id));
const bearing=new Set();const add=ids=>ids.forEach(id=>{if(ingSet.has(id))bearing.add(id);});
add((await page('kg_edge?relation=in.(interacts_with,metabolized_by,inhibits_enzyme,induces_enzyme)&select=source_id,target_id')).flatMap(e=>[e.source_id,e.target_id]));
add((await page('pubmed_interaction_candidate?select=resolved_source_id,resolved_target_id')).flatMap(e=>[e.resolved_source_id,e.resolved_target_id]).filter(Boolean));
try{add((await page('interaction_evaluation_run?select=resolved_source_id,resolved_target_id')).flatMap(e=>[e.resolved_source_id,e.resolved_target_id]).filter(Boolean));}catch(e){}
const byBase={};for(const n of ing)(byBase[base(n.canonical_name)]??=[]).push(n);
const SRCPREF={CPS:0,HEALTH_CANADA_DPD:1,HEALTH_CANADA_NOC:2,HEALTH_CANADA_SUMMARY_REPORT:3};const pref=n=>(SRCPREF[n.source]??9);
const map=[];const canonNames={};let skipMineral=0,skipCombo=0,skipConflict=0,merged=0;
for(const [b,members] of Object.entries(byBase)){
  if(members.length<2||!members.some(m=>bearing.has(m.id)))continue;
  if(isDeferred(b)){skipMineral++;continue;}
  if([...new Set(members.map(atcOf).filter(Boolean))].length>1){skipConflict++;continue;}
  // only single-substance members participate; drop combination members
  const elig=members.filter(m=>!isCombo(m.canonical_name));
  if(elig.length<2){skipCombo++;continue;}
  const canonical=[...elig].sort((a,b)=>pref(a)-pref(b)||a.canonical_name.length-b.canonical_name.length||a.id.localeCompare(b.id))[0];
  canonNames[canonical.id]=canonical.source+':'+canonical.canonical_name;
  for(const m of elig) if(m.id!==canonical.id) map.push({node_id:m.id,canonical_id:canonical.id,loser_name:m.canonical_name,loser_source:m.source,cluster_size:elig.length});
  merged++;
}
console.log('merged clusters:',merged,'| losers:',map.length,'| skipped: mineral/vitamin',skipMineral,'combo-only',skipCombo,'ATC-conflict',skipConflict);
const srcT={};for(const m of map)srcT[m.loser_source]=(srcT[m.loser_source]||0)+1;console.log('losers by source:',JSON.stringify(srcT));
await fetch(U+'/kg_ingredient_merge_map?node_id=not.is.null',{method:'DELETE',headers:{...H,Prefer:'return=minimal'}});
for(let i=0;i<map.length;i+=500){const r=await fetch(U+'/kg_ingredient_merge_map',{method:'POST',headers:{...H,Prefer:'return=minimal'},body:JSON.stringify(map.slice(i,i+500))});if(!r.ok){console.error('insert err',r.status,(await r.text()).slice(0,200));process.exit(1);}}
console.log('wrote',map.length,'rows ->',Object.keys(canonNames).length,'canonical substances');
const byCanon={};for(const m of map)(byCanon[m.canonical_id]??=[]).push(m.loser_source.replace('HEALTH_CANADA_','')+':'+m.loser_name);
console.log('largest remaining clusters (should all be single-substance salt collapses):');
Object.entries(byCanon).sort((a,b)=>b[1].length-a[1].length).slice(0,10).forEach(([cid,ls])=>console.log('   ',canonNames[cid],'<-',ls.slice(0,8).join(' | ')+(ls.length>8?` …(+${ls.length-8})`:'')));
