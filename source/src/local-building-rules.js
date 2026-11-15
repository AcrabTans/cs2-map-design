const localLandmarkCodes=/RadioTelescope|LargeHadronCollider|GeologicalResearchCenter|Observatory|ObservationTower|LandmarkTower|SpaceCenter|HealthResearchInstitute|DiseaseControl|^EE_Research$|Stadium|BotanicalGarden|FerrisWheel|NationalGallery|NotreDame|Nasinneula|OldCastle|SungnyemunGate|NationalDiet|XianBellTower|CentralBank|WaterPark|Museum|Prison|CentralInvestigationBureau|FirefightingHelicopters|FirewatchTower|EarlyDisasterWarningSystem/i;
const localFacilityPatterns=[
 ['universities',/University|College|大学|学院/i],
 ['schools',/School|Kindergarten|小学|中学|幼儿园/i],
 ['clinics',/Clinic|MedicalCenter|Medical Practice|诊所|卫生所/i],
 ['hospitals',/Hospital|Infirmary|医院/i],
 ['railStations',/^(?:\w+_)?(?:Train|Subway)Station/i],
 ['airports',/Airport|机场/i],['ports',/Harbou?r|货港|港口/i],
 ['depots',/Depot|RailYard|CargoTrainTerminal|车辆段/i],
 ['civicCenters',/CityHall|Cemetery|Crematorium|WelfareOffice|Public Library|市政厅/i],
 ['communityServices',/Library|PostOffice|CommunityCenter|CommunityCentre|图书馆|邮局|社区中心/i]
];

export function localAssetRole(asset){
 const {code='',catalogCategory='',type}=asset;
 if(catalogCategory==='research'||localLandmarkCodes.test(code))return 'special';
 if(type==='police'||type==='fire')return type;
 if(['energy','waste','water'].includes(catalogCategory))return catalogCategory;
 if(/WaterTower/i.test(code))return 'water';
 return localFacilityPatterns.find(([,pattern])=>pattern.test(code))?.[0]||null;
}

export const localUseFacility={
 university:'universities','tech-university':'universities',education:'schools',clinic:'clinics',medical:'hospitals',
 police:'police',fire:'fire',station:'railStations',airport:'airports',port:'ports',depot:'depots',
 power:'energy',waste:'waste',water:'water',civic:'civicCenters',service:'communityServices'
};

export const localFacilityReach={
 universities:120,schools:350,clinics:450,hospitals:600,police:550,fire:550,railStations:350,
 airports:1200,ports:450,depots:450,energy:550,waste:550,water:550,civicCenters:500,communityServices:400
};

export const localSupportLabels={
 university:'校园配套楼','tech-university':'校园配套楼',medical:'医疗配套楼',innovation:'研发办公',pharma:'研发办公'
};

// Typical meters and spread for buildings on the same street or in the same group.
const localUseHeights={
 villa:[9,3],old:[12,4],'mid-res':[21,5],'high-res':[42,9],'mid-mix':[31,6],'high-mix':[43,8],
 commerce:[12,5],market:[9,4],office:[32,12],university:[19,6],'tech-university':[19,6],
 education:[13,6],medical:[19,6],clinic:[12,4],innovation:[18,6],pharma:[15,6],
 industry:[11,5],vehicle:[12,5],data:[13,5],depot:[12,6],shipyard:[12,6],tourism:[10,5]
};

export function localHeightProfile(type,districtUse){
 let [height,spread]=localUseHeights[type]||[15,7];
 if(type==='office'&&['commerce','high-mix','office'].includes(districtUse))height=52;
 if(type==='mid-res'&&['villa','old'].includes(districtUse))height=17;
 if(type==='commerce'&&['villa','old'].includes(districtUse))height=9;
 return {height,spread};
}
