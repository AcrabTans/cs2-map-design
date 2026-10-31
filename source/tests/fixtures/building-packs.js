// Synthetic regression fixtures; no game or mod assets.
const asset=i=>({id:'synthetic-'+i,code:'SyntheticBuilding'+i,name:'Synthetic Building '+i,type:'residential',lot:[64,56],height:12+i%20,area:80,maxResidents:null,maxEmployees:null,rings:[[[-5,-4],[5,-4],[5,4],[-5,4]]]});
export const BUILTIN_BUILDING_PACKS=[11,1,168].map((count,p)=>({id:'synthetic-pack-'+p,name:'Synthetic Pack '+p,assets:Array.from({length:count},(_,i)=>asset(i))}));

for(let i=156;i<168;i++){const a=BUILTIN_BUILDING_PACKS[2].assets[i];a.type='municipal';a.code='SyntheticFacility'+(i-156);a.maxEmployees=i===156?12:i===157?0:null;}
BUILTIN_BUILDING_PACKS[2].assets[167].rings=Array.from({length:12},(_,i)=>{const x=i%3*3,y=Math.floor(i/3)*3;return [[x,y],[x+1,y],[x+1,y+1],[x,y+1]];});
BUILTIN_BUILDING_PACKS[2].assets[167].area=12;
