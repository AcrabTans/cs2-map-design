// Original naming components. The Latin text is a display spelling, including local romanizations.
function namingWords(text){
  return text.trim().split(/\s+/).map(pair=>pair.split(':'));
}
function namingStyle(label, starts, ends, options={}){
  return {label,starts:namingWords(starts),ends:namingWords(ends),...options};
}
export const NAME_STYLES={
  yangtze:namingStyle('长三角',
    '澄:Cheng 晓:Xiao 清:Qing 景:Jing 润:Run 苏:Su 云:Yun 兰:Lan 翠:Cui 嘉:Jia 越:Yue 锦:Jin 秀:Xiu 念:Nian 望:Wang 映:Ying 宜:Yi 霁:Ji 梧:Wu 竹:Zhu 桂:Gui 雁:Yan 归:Gui 柳:Liu 海:Hai 杏:Xing 鹤:He 书:Shu 玉:Yu 青:Qing 春:Chun 慕:Mu',
    '泾:Jing 渚:Zhu 埭:Dai 塘:Tang 浦:Pu 溪:Xi 桥:Qiao 港:Gang 洲:Zhou 园:Yuan 湖:Hu 漪:Yi 泽:Ze 泉:Quan 湾:Wan 岸:An 村:Cun 陌:Mo 榭:Xie 堤:Di 樾:Yue 里:Li 山:Shan 丘:Qiu 林:Lin 楼:Lou 阁:Ge 廊:Lang 巷:Xiang 渡:Du 津:Jin 阶:Jie'),
  pearl:namingStyle('珠三角',
    '穗:Sui 粤:Yue 榕:Rong 荔:Li 莞:Guan 南:Nan 锦:Jin 麓:Lu 新:Xin 芳:Fang 海:Hai 华:Hua 明:Ming 珠:Zhu 金:Jin 翠:Cui 广:Guang 佛:Fo 番:Fan 顺:Shun 禅:Chan 端:Duan 香:Xiang 鹤:He 福:Fu 梅:Mei 菊:Ju 丹:Dan 芦:Lu 乐:Le 丰:Feng 瑞:Rui',
    '沙:Sha 涌:Chong 浦:Pu 埔:Pu 围:Wei 滘:Jiao 洲:Zhou 岗:Gang 田:Tian 湾:Wan 角:Jiao 岭:Ling 樵:Qiao 岸:An 头:Tou 塘:Tang 江:Jiang 基:Ji 村:Cun 冲:Chong 泮:Pan 埒:Lie 墩:Dun 圩:Xu 垄:Long 石:Shi 坑:Keng 沥:Li 埗:Bu 堤:Di 堡:Bao 林:Lin'),
  central:namingStyle('中原',
    '豫:Yu 宛:Wan 洛:Luo 梁:Liang 汝:Ru 嵩:Song 汴:Bian 颍:Ying 郑:Zheng 成:Cheng 文:Wen 兴:Xing 祥:Xiang 德:De 永:Yong 宁:Ning 伊:Yi 荥:Xing 新:Xin 安:An 卫:Wei 怀:Huai 浚:Xun 唐:Tang 景:Jing 建:Jian 龙:Long 福:Fu 长:Chang 厚:Hou 清:Qing 和:He',
    '原:Yuan 陵:Ling 坡:Po 台:Tai 渠:Qu 渡:Du 店:Dian 铺:Pu 里:Li 庄:Zhuang 桥:Qiao 阜:Fu 川:Chuan 关:Guan 城:Cheng 河:He 坞:Wu 屯:Tun 坳:Ao 岭:Ling 峪:Yu 阁:Ge 坪:Ping 滩:Tan 塬:Yuan 井:Jing 田:Tian 门:Men 巷:Xiang 梁:Liang 津:Jin 堤:Di'),
  jingjinji:namingStyle('京津冀',
    '燕:Yan 蓟:Ji 津:Jin 冀:Ji 海:Hai 顺:Shun 昌:Chang 永:Yong 安:An 平:Ping 崇:Chong 广:Guang 怀:Huai 北:Bei 景:Jing 玉:Yu 渤:Bo 蔚:Yu 密:Mi 易:Yi 涿:Zhuo 赵:Zhao 武:Wu 静:Jing 敬:Jing 清:Qing 松:Song 雁:Yan 虹:Hong 云:Yun 金:Jin 槐:Huai',
    '坊:Fang 营:Ying 铺:Pu 屯:Tun 庄:Zhuang 甸:Dian 台:Tai 关:Guan 坞:Wu 堡:Bao 桥:Qiao 口:Kou 沟:Gou 洼:Wa 河:He 淀:Dian 营:Ying 里:Li 泉:Quan 园:Yuan 湾:Wan 岗:Gang 坡:Po 栅:Zha 闸:Zha 店:Dian 厂:Chang 楼:Lou 桥:Qiao 谷:Gu 峪:Yu 口:Kou'),
  hongkong:namingStyle('香港',
    '青:Ching 景:King 永:Wing 顺:Shun 嘉:Ka 安:On 禾:Wo 德:Tak 乐:Lok 富:Fu 碧:Pik 海:Hoi 荣:Wing 瑞:Sui 康:Hong 宝:Po 东:Tung 西:Sai 南:Nam 北:Pak 翠:Tsui 秀:Sau 石:Shek 紫:Tsz 银:Ngan 金:Kam 竹:Chuk 松:Chung 英:Ying 美:Mei 明:Ming 宁:Ning',
    '湾:Wan 涌:Chung 围:Wai 塘:Tong 石:Shek 山:Shan 角:Kok 梅:Mui 田:Tin 坪:Ping 岭:Leng 洲:Chau 径:King 岸:On 滩:Tan 埔:Po 围:Wai 碧:Pik 里:Lei 坊:Fong 道:To 台:Toi 峰:Fung 头:Tau 海:Hoi 湾:Wan 圆:Yuen 村:Tsuen 廊:Long 涯:Ngai 汀:Ting 坑:Hang'),
  macau:namingStyle('澳门',
    '莲:Lin 镜:Keng 濠:Hou 澳:Ou 氹:Tam 嘉:Ka 德:Tak 安:On 新:San 明:Meng 松:Chong 福:Fok 祥:Cheong 海:Hoi 青:Cheng 康:Hong 渔:Yu 金沙:Kam-Sa 花:Fa 碧:Pik 芳:Fong 紫:Chi 竹:Chok 宝:Pou 瑞:Soi 泰:Tai 德:Tak 景:Keng 鹭:Lou 福:Fu 青:Ching 熙:Hei',
    '台:Toi 湾:Van 山:San 巷:Hong 里:Lei 沙:Sa 岸:On 桥:Kiu 围:Vai 角:Kok 岗:Kong 岭:Leng 泉:Chun 庭:Teng 埔:Pou 场:Cheong 滩:Tan 洲:Chau 塘:Tong 沙:Sha 坊:Fong 园:Un 里:Li 门:Mun 径:Keng 亭:Ting 林:Lam 台:Tai 带:Tai 岭:Leng 埔:Pou 泊:Pak', {road:['街:Rua_{stem}','路:Estrada_{stem}','大马路:Avenida_{stem}','巷:Travessa_{stem}']}),
  taiwan:namingStyle('台湾',
    '文:Wen 民:Min 仁:Ren 信:Xin 义:Yi 和:He 福:Fu 松:Song 新:Xin 瑞:Rui 嘉:Jia 玉:Yu 竹:Zhu 湖:Hu 芳:Fang 安:An 东:Dong 西:Xi 南:Nan 北:Bei 桃:Tao 宜:Yi 花:Hua 云:Yun 福:Fuk 祥:Xiang 锦:Jin 崇:Chong 学:Xue 明:Ming 慈:Ci 怀:Huai',
    '庄:Zhuang 寮:Liao 坑:Keng 埔:Pu 湾:Wan 屿:Yu 里:Li 厝:Cuo 溪:Xi 桥:Qiao 岭:Ling 岸:An 平:Ping 南:Nan 兴:Xing 德:De 港:Gang 脚:Jiao 林:Lin 厅:Ting 口:Kou 顶:Ding 尾:Wei 仑:Lun 仔:Zi 湖:Hu 溪:Hsi 埤:Pi 岸:An 窟:Ku 尾:Bue 沙:Sha'),
  malaysia:namingStyle('马来西亚',
    '斯里:Seri 美拉:Mela 丹绒:Tanjung 武吉:Bukit 双溪:Sungai 甘榜:Kampung 巴东:Padang 班台:Pantai 达迈:Damai 珍珠:Mutiara 美丽:Indah 森美:Semi 哥打:Kota 德沙:Desa 乌鲁:Ulu 古邦:Kubang 金:Emas 银:Perak 友谊:Sahabat 山谷:Lembah 文达:Venda 绿洲:Hijau 明珠:Permata 森林:Rimba 美景:Permai 太阳:Suria 松树:Cemara 吉打:Kedah 巴生:Klang 达鲁:Darul 峇都:Batu 格林:Kelam',
    '英丹:Intan 莲花:Teratai 占巴卡:Cempaka 默兰蒂:Meranti 肯纳里:Kenari 榕树:Beringin 达哈:Saga 兰花:Orkid 达达普:Dadap 锡矿:Timah 柏灵:Belimbing 瓜拉:Kuala 劳特:Laut 马都:Madu 峇央:Bayan 迪沙:Desa 芒果:Mangga 班兰:Pandan 扶桑:Bunga-Raya 蓝花:Telang 茉莉:Melati 金砂:Pasir 松木:Merbau 班竹:Buluh 丁香:Cengkih 木棉:Kekabu 克拉:Kelar 甘巴:Gambir 美塔:Meta 柯打:Koda 星光:Bintang 彩虹:Pelangi', {space:true,road:['路:Jalan_{stem}','大道:Persiaran_{stem}','巷:Lorong_{stem}','通道:Lintasan_{stem}']}),
  singapore:namingStyle('新加坡',
    '裕廊:Jurong 实龙岗:Serangoon 勿洛:Bedok 淡滨尼:Tampines 巴西立:Pasir-Ris 榜鹅:Punggol 后港:Hougang 义顺:Yishun 盛港:Sengkang 加冷:Kallang 金文泰:Clementi 梧槽:Rochor 武吉:Bukit 直落:Telok 樟宜:Changi 榕港:Ronggang 纽顿:Newton 皇后镇:Queenstown 杜弗:Dover 波东巴西:Potong-Pasir 黄埔:Whampoa 马里士他:Balestier 联邦:Commonwealth 欧南:Outram 亚历山大:Alexandra 直落布兰雅:Telok-Blangah 万礼:Mandai 克兰芝:Kranji 兀兰:Woodlands 加基武吉:Kaki-Bukit 乌美:Ubi 先驱:Pioneer',
    '翠园:Green 滨湾:Bay 榕苑:Grove 滨水:Quay 北苑:North 南苑:South 新岸:Shore 碧台:Terrace 棕榈:Palm 松园:Pines 明峰:Heights 新桥:Bridge 莲庭:Lotus 美景:Vista 花园:Garden 清泉:Spring 翠岭:Woodridge 海景:Seaview 金港:Harbour 明园:Meadow 远景:Viewpoint 春谷:Valley 新台:Square 迎风:Windward 白沙:Sands 云园:Cloud-Garden 河畔:Riverside 翠湖:Lakeside 栖岸:Landing 椰庭:Coconut-Court 兰亭:Orchid-Terrace 彩苑:Rainbow-Grove', {space:true}),
  japan:namingStyle('日本',
    '青:Ao 朝:Asa 白:Shira 松:Matsu 桜:Sakura 竹:Take 梅:Ume 若:Waka 富:Tomi 高:Taka 雪:Yuki 花:Hana 星:Hoshi 月:Tsuki 霞:Kasumi 森:Mori 赤:Aka 黒:Kuro 西:Nishi 東:Higashi 南:Minami 北:Kita 新:Shin 本:Hon 小:Ko 大:O 中:Naka 上:Kami 下:Shimo 鶴:Tsuru 錦:Nishiki 橘:Tachibana',
    '原:Hara 川:Kawa 台:Dai 野:No 丘:Oka 崎:Saki 岛:Shima 泽:Sawa 浦:Ura 滨:Hama 谷:Tani 林:Hayashi 町:Machi 桥:Hashi 沢:Zawa 里:Sato 堀:Hori 浜:Hama 池:Ike 沼:Numa 坂:Saka 津:Tsu 崖:Gake 磯:Iso 岬:Misaki 峠:Toge 森:Mori 丸:Maru 宿:Juku 口:Guchi 岡:Oka 島:Shima', {road:['通:_{stem}_Dori','坂:_{stem}_Zaka','小路:_{stem}_Koji','街道:_{stem}_Kaido']}),
  usa:namingStyle('美国',
    '雪松:Cedar 红杉:Redwood 橡树:Oak 枫树:Maple 柳树:Willow 白杨:Aspen 银桦:Birch 黑松:Pine 鹰:Eagle 灰岩:Slate 铜:Copper 石英:Quartz 金:Golden 银:Silver 西:West 日落:Sunset 栗树:Chestnut 山核桃:Hickory 红枫:Redmaple 榆树:Elm 核桃:Walnut 冬青:Holly 牧场:Prairie 山雀:Finch 蓝鸟:Bluebird 丘鹬:Woodcock 云杉:Spruce 角松:Larch 白石:Whitestone 绿石:Greenstone 晨雾:Misty 野玫瑰:Wildrose',
    '溪:brook 岭:ridge 湾:bay 林:wood 河:river 山:hill 谷:vale 湖:lake 原:field 角:point 坡:slope 岸:shore 滩:beach 港:harbor 泉:spring 园:garden 湾头:haven 眺望:crest 草原:plain 山口:pass 洼地:hollow 溪口:mouth 瀑布:falls 渡口:ferry 岛:isle 泥滩:flat 石径:trail 榭:terrace 草地:meadow 田埂:bank 营地:camp 绿地:green', {join:true}),
  west:namingStyle('西欧',
    '艾尔:Elm 贝尔:Bel 格林:Green 哈特:Hart 艾什:Ash 罗斯:Rose 惠特:Whit 韦斯特:West 朗:Long 霍桑:Hawthorn 布莱克:Black 克利夫:Cliff 雷文:Raven 温德:Wind 斯通:Stone 莱姆:Lime 费尔:Fair 奥克:Oak 罗温:Rowan 伯恩:Burn 艾登:Alden 古德:Good 韦尔:Well 费恩:Fern 莫尔:Moor 莱伊:Rye 斯帕罗:Sparrow 威洛:Willow 阿什顿:Ashton 沃特:Water 桑德:Sand 银木:Silverwood',
    '顿:ton 汉姆:ham 沃思:worth 伯里:bury 菲尔德:field 福德:ford 伍德:wood 代尔:dale 韦尔:vale 克罗夫特:croft 布里奇:bridge 赫斯特:hurst 威克:wick 斯托:stow 霍尔特:holt 米尔:mill 哈文:haven 林:grove 格林:green 米德:mead 盖特:gate 格伦:glen 桑德:sands 科姆:combe 赛德:side 博纳:bourne 格拉斯:glass 维拉:villa 伍斯:woodhouse 蒙特:mont 瓦尔:val 布鲁克:brook', {join:true}),
  nordic:namingStyle('北欧',
    '索尔:Sol 林德:Lind 比约克:Björk 格兰:Gran 诺德:Nord 斯诺:Snö 弗罗斯特:Frost 阿尔夫:Alv 斯泰因:Stein 维德:Vid 罗森:Rosen 阿斯:Ask 布洛:Blå 利尤斯:Ljus 达尔:Dal 克隆:Kron 瓦尔:Val 芬恩:Finn 豪克:Hauk 罗恩:Røn 尼:Ny 甘梅尔:Gammel 斯托尔:Stor 利勒:Lille 弗里:Fri 维特:Vit 斯瓦特:Svart 斯库格:Skug 海斯:Hest 菲斯克:Fisk 斯韦德:Sved 奥斯特:Øster',
    '维克:vik 霍尔姆:holm 达尔:dal 贝里:berg 隆德:lund 巴克:back 斯特兰德:strand 哈文:havn 松德:sund 内斯:nes 维德:vid 斯科格:skog 福斯:foss 黑姆:heim 菲尔:fjell 默尔克:mark 索:so 埃尔夫:elv 亚尔:jar 森:sæter 通:tun 维德:ved 莫:mo 布吕格:brygge 盖特:gate 克洛夫:kloft 博:bo 托夫特:toft 舍尔:skär 穆尔:mur 特雷:tre 瓦滕:vatten', {join:true,road:['街:{stem}gata','路:{stem}vägen','大道:{stem}allé','径:{stem}stig']}),
  east:namingStyle('东欧',
    '贝拉:Bela 诺瓦:Nova 斯塔拉:Stara 维索卡:Vysoka 克拉斯纳:Krasna 多尔纳:Dolna 戈尔纳:Gorna 泽莱纳:Zelena 杜布拉:Dobra 斯韦特拉:Svetla 兹拉塔:Zlata 维利卡:Velika 布热扎:Brzeza 杜布:Dub 维特尔:Vetr 罗扎:Roza 亚斯纳:Jasna 切尔沃纳:Czerwona 索科尔:Sokol 维耶特拉:Vetra 德雷沃:Drevo 列斯纳:Lesna 波洛瓦:Polova 比斯特拉:Bystra 日特纳:Zytna 卢奇纳:Lucina 米拉:Mila 蒂哈:Ticha 耶泽尔:Jezerná 格拉多瓦:Gradova 戈卢布:Golub 普热德:Przed',
    '戈拉:Gora 多利纳:Dolina 雷卡:Reka 波拉纳:Polana 卢卡:Luka 奥斯特罗夫:Ostrov 格拉德:Grad 格罗夫:Grove 洛米:Lomy 莫斯特:Most 维斯:Ves 博尔:Bor 拉斯:Las 布热格:Brzeg 佩特拉:Petra 维尔赫:Vrch 卡米恩:Kamien 斯托克:Stok 多姆:Dom 米林:Mlyn 维斯纳:Visna 格鲁德:Grud 萨德:Sad 斯卡拉:Skala 杰罗:Jezero 波列:Pole 维尔巴:Vrba 普托克:Potok 茨韦特:Cvet 彼得罗:Petro 德沃尔:Dvor 扎托卡:Zatoka', {space:true,road:['街:Ulica_{stem}','大道:Prospekt_{stem}','路:Droga_{stem}','巷:Pereulok_{stem}']})
};

// Road forms are shared by road grades, with regional renderings where appropriate.
const roadForms='路:Road 街:Street 大道:Avenue 大街:Boulevard 巷:Lane 里:Close 弄:Alley 径:Path 道:Drive 环路:Loop 横街:Cross_Street 支路:Way 滨道:Promenade 景观路:Parkway 外环:Ring_Road 高速:Expressway 林荫路:Esplanade 滨河路:Riverside_Road 辅路:Frontage_Road 新街:New_Street 广场路:Square_Road 北环道:Northern_Arc 堤道:Causeway 东联路:Eastern_Link';
const namingTypes={
  road:['道路（全部）',roadForms], highway:['高速／快速路','高速:Expressway 快速路:Freeway 外环:Ring_Road 联络线:Connector 高速公路:Motorway 环城快速路:Beltway'],
  arterial:['主干道','大道:Avenue 大街:Boulevard 干道:Arterial_Road 景观大道:Parkway 干线大道:Main_Avenue 中轴路:Central_Artery'],
  secondary:['次干道','路:Road 街:Street 环路:Loop 横街:Cross_Street 支干路:Collector_Road 连通道:Link_Road'],
  local:['支路／小路','巷:Lane 里:Close 弄:Alley 径:Path 支路:Way 步行径:Walk 小街:Mews'],
  bridge:['桥梁／隧道','桥:Bridge 大桥:Grand_Bridge 高架桥:Viaduct 隧道:Tunnel 跨河桥:River_Crossing 连廊桥:Link_Bridge'],
  island:['岛屿','岛:Island 群岛:Isles 小岛:Islet 沙洲:Cay 礁:Reef 外岛:Outer_Island'], peninsula:['半岛','半岛:Peninsula 海角:Cape 角:Point 岬:Headland 岬角:Promontory 滨角:Foreland'],
  city:['城市','市:City 城:City_Proper 都:Metropolis 都市区:Metropolitan_Area 都会:Urban_Centre 港城:Port_City'], town:['小镇／乡村','镇:Town 村:Village 乡:Township 集镇:Market_Town 新镇:New_Town 山村:Hill_Village'],
  block:['街区／片区','街区:Quarter 片区:District 新区:New_District 社区:Community 坊:Ward 里坊:Neighbourhood'],
  elementary:['小学','小学:Elementary_School 第一小学:No._1_Elementary_School 实验小学:Experimental_Primary_School 中心小学:Central_Primary_School 附属小学:Affiliated_Primary_School 育才小学:Academy_Primary_School'],
  middle:['初中','初级中学:Junior_High_School 实验初中:Experimental_Middle_School 第二初级中学:No._2_Middle_School 中学:Middle_School 外国语初中:Foreign_Language_Middle_School 附属初中:Affiliated_Junior_High'],
  high:['高中','高级中学:Senior_High_School 第一高中:No._1_High_School 实验高中:Experimental_High_School 学院预备校:Preparatory_School 科技高中:Science_High_School 附属高中:Affiliated_Senior_High'],
  university:['大学／学院','大学:University 理工大学:Institute_of_Technology 学院:College 医学院:Medical_College 科技学院:College_of_Science 师范大学:Normal_University'],
  clinic:['诊所／社区卫生','诊所:Clinic 社区卫生中心:Community_Health_Centre 门诊部:Outpatient_Clinic 家庭诊所:Family_Clinic 健康站:Health_Station 康复诊所:Rehabilitation_Clinic'],
  hospital:['医院／医疗中心','医院:Hospital 中心医院:Central_Hospital 综合医院:General_Hospital 医疗中心:Medical_Centre 专科医院:Specialty_Hospital 康复医院:Rehabilitation_Hospital'],
  residential:['住宅小区','花园:Garden_Residences 家园:Residences 公馆:Manor 府:Court 雅苑:Grove 里:Place 名邸:Heights 水岸:Waterfront_Residences'],
  commerce:['商业／商场','广场:Plaza 商城:Mall 商街:Shopping_Quarter 市集:Market 中心:Centre 商业中心:Retail_Centre 购物公园:Retail_Park'],
  factory:['工厂／产业园','工厂:Works 制造中心:Manufacturing_Centre 工业园:Industrial_Park 产业基地:Production_Campus 加工厂:Processing_Plant 装配基地:Assembly_Plant'],
  office:['写字楼／办公园','大厦:Tower 商务中心:Business_Centre 写字楼:Office_Building 商务园:Business_Park 金融中心:Financial_Centre 办公广场:Office_Plaza'],
  park:['公园／景点','公园:Park 花园:Gardens 游园:Leisure_Park 景区:Scenic_Area 湿地公园:Wetland_Park 观景园:Scenic_Garden'],
  transport:['车站／港口','站:Station 枢纽:Terminal 港:Port 码头:Pier 客运站:Passenger_Terminal 货运中心:Freight_Centre']
};
export const NAME_TYPES=Object.fromEntries(Object.entries(namingTypes).map(([key,[label]])=>[key,label]));

export function nameCandidates(styleId,typeId,language='both'){
  const style=NAME_STYLES[styleId],type=namingTypes[typeId];
  if(!style||!type)return [];
  const forms=namingWords(type[1]);
  if(typeId==='road'&&style.road)forms.unshift(...style.road.flatMap(namingWords));
  const names=new Set();
  for(const [zhStart,enStart] of style.starts){
    for(const [zhEnd,enEnd] of style.ends){
      const stem=style.space?enStart+' '+enEnd:style.join?enStart+enEnd:enStart+enEnd.toLowerCase();
      for(const [zhForm,enForm] of forms){
        const zh=zhStart+zhEnd+zhForm;
        const en=(enForm.includes('{stem}')?enForm.replace('{stem}',stem):stem+' '+enForm).replaceAll('_',' ').trim();
        names.add(language==='zh'?zh:language==='en'?en:zh+' / '+en);
      }
    }
  }
  return [...names];
}

export function drawNames(candidates,count,exclude=[]){
  const reserved=new Set(exclude.flatMap(value=>[value,...value.split(' / ')]).map(value=>value.trim().toLowerCase()));
  const pool=candidates.filter(name=>!name.split(' / ').some(part=>reserved.has(part.toLowerCase()))&&!reserved.has(name.toLowerCase()));
  const size=Math.min(count,pool.length);
  for(let i=0;i<size;i++){
    const j=i+Math.floor(Math.random()*(pool.length-i));
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  return pool.slice(0,size);
}
