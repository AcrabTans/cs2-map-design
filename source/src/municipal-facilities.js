// The catalog keeps the same labels and pictograms in the map and layer list.
export const MUNICIPAL_CATALOG = [
  ['rail-facilities', '铁路车站与车辆段', '#85502d', 'rail'],
  ['bus-facilities', '公交场站', '#206f4e', 'bus', 'transit-facilities'],
  ['metro-facilities', '地铁车站与车辆段', '#6745a3', 'metro', 'transit-facilities'],
  ['tram-facilities', '有轨电车场站', '#a44b33', 'tram', 'transit-facilities'],
  ['air-facilities', '机场与航空设施', '#305f91', 'air'],
  ['water-facilities', '港口与水运设施', '#13728b', 'ship'],
  ['transit-facilities', '其他交通设施与枢纽', '#386b70', 'transfer'],
  ['power-generation', '发电设施', '#a26312', 'power', 'utilities'],
  ['power-grid', '变电与输配电设施', '#80611b', 'pylon', 'utilities'],
  ['water-supply', '取水与供水设施', '#2069a6', 'water', 'utilities'],
  ['sewage', '污水处理设施', '#5d6c3e', 'sewage', 'utilities'],
  ['waste', '环卫与废物处理', '#66533c', 'waste', 'utilities'],
  ['communications', '通信设施', '#734d86', 'antenna', 'other-points'],
  ['postal', '邮政设施与邮箱', '#a34049', 'post', 'other-points'],
  ['parking', '公共停车设施', '#335687', 'parking', 'civic'],
  ['civic', '政务与其他公共设施', '#5b6475', 'civic'],
  ['utilities', '其他公用设施', '#757044', 'utility'],
  ['rail-stops', '铁路站点', '#85502d', 'rail'],
  ['bus-stops', '公交站点', '#206f4e', 'bus', 'transit-stops'],
  ['metro-stops', '地铁站点', '#6745a3', 'metro', 'transit-stops'],
  ['tram-stops', '有轨电车站点', '#a44b33', 'tram', 'transit-stops'],
  ['taxi-stops', '出租车站点', '#8b5e14', 'taxi', 'transit-stops'],
  ['air-stops', '航空停靠点', '#305f91', 'air'],
  ['helipads', '直升机停机坪', '#486d93', 'helipad', 'air-stops'],
  ['water-stops', '水运停靠点', '#13728b', 'ship'],
  ['transit-stops', '其他交通站点', '#386b70', 'transfer'],
  ['level-crossings', '铁路道口', '#9a5924', 'crossing', 'other-points'],
  ['traffic-lights', '红绿灯', '#854855', 'signal'],
  ['other-points', '其他市政点位', '#606c76', 'point'],
];

const municipalGlyphs = {
  rail: 'M5 3h6a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2Zm-2 5h10M8 3v5m-3 4-2 2m8-2 2 2M5.5 10h.01m5 0h.01',
  bus: 'M4 3h8a1 1 0 0 1 1 1v8H3V4a1 1 0 0 1 1-1Zm-1 5h10M4 12v2m8-2v2M5 10h.01m6 0h.01',
  metro: 'M3 12V4l5 5 5-5v8',
  tram: 'm6 2 4 2-4 2m-2 0h8v6H4zm0 3h8m-7 3-2 2m8-2 2 2',
  air: 'M8 2v12m0-9-6 5m6-5 6 5m-6 1-3 2m3-2 3 2',
  ship: 'M2 9h12l-2 3H4Zm3 0V5h6v4M7 5V3m-5 11c2-1.5 4 1.5 6 0s4 1.5 6 0',
  transfer: 'M2 5h11l-2.5-2.5M14 11H3l2.5 2.5',
  power: 'm9 2-6 7h5l-1 5 6-7H8Z',
  pylon: 'M8 2 4 14M8 2l4 12M3 5h10M2 8h12M6 9l4 4m0-4-4 4',
  water: 'M8 2C6 5 3.5 7.5 3.5 10a4.5 4.5 0 0 0 9 0C12.5 7.5 10 5 8 2Z',
  sewage: 'M8 2c-2 3-4 5-4 7a4 4 0 0 0 8 0c0-2-2-4-4-7Zm-6 12c2-1.5 4 1.5 6 0s4 1.5 6 0',
  waste: 'M3 5h10M6 5V3h4v2M4 5l1 9h6l1-9M7 7v4m2-4v4',
  antenna: 'M8 8v6m-3 0 3-6 3 6M5 9a4 4 0 0 1 0-5m6 0a4 4 0 0 1 0 5m-8 2a7 7 0 0 1 0-9m10 0a7 7 0 0 1 0 9',
  post: 'M2 4h12v8H2Zm0 0 6 5 6-5',
  parking: 'M5 13V3h4a2.5 2.5 0 1 1 0 5H5',
  civic: 'm2 6 6-4 6 4H2zm2 2v4m4-4v4m4-4v4M2 14h12',
  utility: 'M5 3h6v3h3v5h-3v3H5v-3H2V6h3Z',
  taxi: 'M2 6h12v3H9v5H7V9H2Zm4-3h4',
  helipad: 'M4 3v10m8-10v10M4 8h8',
  crossing: 'm3 3 10 10M13 3 3 13M2 8h12',
  signal: 'M5 2h6v12H5Zm3 3h.01m0 3h.01m0 3h.01',
  point: 'm8 2 6 6-6 6-6-6Z',
};

const municipalStyleById = new Map(MUNICIPAL_CATALOG.map(([id, name, color, icon]) => [id, {name, color, path: municipalGlyphs[icon]}]));
export const municipalMarkerStyle = id => municipalStyleById.get(id);

// Carto supplies specific categories for stops and utility equipment. These
// take precedence over the translated name of the surrounding development.
export function municipalCategoryFromTags(category, point = true) {
  const tags = String(category || '').toLowerCase().replace(/[\s_-]/g, '');
  if (/trafficlight/.test(tags)) return 'traffic-lights';
  if (/levelcrossing/.test(tags)) return 'level-crossings';
  if (/helipad/.test(tags)) return 'helipads';
  if (/sewage|wastewater/.test(tags)) return 'sewage';
  if (/\bwaste\b|landfill|garbage|recycl/.test(tags)) return 'waste';
  if (/utilitypylon|utilitypole|powersubstation|powerline|transformer/.test(tags)) return 'power-grid';
  if (/powerplant|powerturbine|solargenerator/.test(tags)) return 'power-generation';
  if (/^water$|\bwater\b|waterpump|watertower/.test(tags)) return 'water-supply';
  if (/communication|radiotower|celltower/.test(tags)) return 'communications';
  if (/postbox|postoffice|postal|mailbox/.test(tags)) return 'postal';
  if (/\bparking\b|publicparking|parkinglot/.test(tags)&&!/store|commercial/.test(tags)) return 'parking';
  if (point && /\bstop/.test(tags)) {
    if (/stop\w*(?:train|rail)/.test(tags)) return 'rail-stops';
    if (/stop\w*(?:airplane|helicopter)/.test(tags)) return 'air-stops';
    if (/stop\w*(?:ship|ferry|boat)/.test(tags)) return 'water-stops';
    if (/stop\w*(?:subway|metro)/.test(tags)) return 'metro-stops';
    if (/stop\w*tram/.test(tags)) return 'tram-stops';
    if (/stop\w*taxi/.test(tags)) return 'taxi-stops';
    if (/stop\w*bus/.test(tags)) return 'bus-stops';
    return 'transit-stops';
  }
  if (/building\w*train|depottrain/.test(tags)) return 'rail-facilities';
  if (/building\w*(?:airplane|helicopter)|airport/.test(tags)) return 'air-facilities';
  if (/building\w*(?:ship|ferry)|harbor/.test(tags)) return 'water-facilities';
  if (/(?:building|depot)(?:subway|metro)/.test(tags)) return 'metro-facilities';
  if (/(?:building|depot)tram/.test(tags)) return 'tram-facilities';
  if (/(?:building|depot)bus/.test(tags)) return 'bus-facilities';
  return null;
}

export function classifyMunicipalName(name, point) {
  if (/红绿灯|交通信号灯|traffic[\s_-]*light/i.test(name)) return 'traffic-lights';
  if (/铁路道口|平交道口|level crossing/i.test(name)) return 'level-crossings';
  if (/直升机.*(?:停机|起降)|直升机坪|helipad/i.test(name)) return 'helipads';
  if (/污水|废水|sewage|wastewater/i.test(name)) return 'sewage';
  if (/垃圾|回收|环卫|废料|焚烧|recycling|landfill|incinerat/i.test(name)) return 'waste';
  if (/变电|配电|输电|电线杆|电塔|power substation|utility (?:pole|pylon)/i.test(name)) return 'power-grid';
  if (/发电|电厂|风机|power plant|turbine|solar generator/i.test(name)) return 'power-generation';
  if (/水厂|取水|供水|泵站|水塔|water pump|water tower/i.test(name)) return 'water-supply';
  if (/通信|电视塔|广播塔|卫星上行|communication|radio tower/i.test(name)) return 'communications';
  if (/邮局|邮箱|邮政|post box|post office|mailbox/i.test(name)) return 'postal';
  if (/停车场|停车楼|parking/i.test(name)) return 'parking';
  if (/火车站牌/.test(name)) return 'rail-stops';
  if (/地铁站位预留|地铁站点/.test(name)) return 'metro-stops';
  if (/站位预留/.test(name)) return 'transit-stops';
  if (/机场|航站|航空|停机|机坪|airport|airfield|hangar/i.test(name)) return 'air-facilities';
  if (/火车|铁路|轨道总站|railway|railroad|train.*(?:station|depot)/i.test(name)) return 'rail-facilities';
  if (/港口|码头|船坞|harbo[u]?r|seaport|ferry/i.test(name)) return 'water-facilities';
  if (/地铁|subway|metro/i.test(name)) return 'metro-facilities';
  if (/有轨电车|tram/i.test(name)) return 'tram-facilities';
  if (/公交|巴士|\bbus\b/i.test(name)) return 'bus-facilities';
  if (/换乘|transit|station entrance/i.test(name)) return 'transit-facilities';
  if (/公用设施|\butility\b/i.test(name)) return 'utilities';
  return point ? 'other-points' : 'civic';
}
