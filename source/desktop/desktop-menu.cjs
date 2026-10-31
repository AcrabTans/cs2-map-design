exports.desktopMenu=(win,openExtractor)=>{
 const action=(label,id,accelerator)=>({label,id,...(accelerator?{accelerator}:{}),click:()=>win.webContents.send('md:command',id)});
 return [
  {label:'文件(&F)',submenu:[
   action('新建工程','newProjectBtn','Ctrl+N'),action('打开工程…','openProjectTop','Ctrl+O'),action('打开项目文件夹…','openProjectFolderTop'),
   {type:'separator'},action('保存','saveProjectTop','Ctrl+S'),action('另存为…','saveAsProjectTop','Ctrl+Shift+S'),
   {type:'separator'},action('导入 Carto 文件夹…','cartoFolderBtn'),
   {type:'separator'},action('导出 Carto…','exportCartoBtn'),action('导出 PNG…','exportPngBtn'),
   {type:'separator'},{label:'退出',click:()=>win.close()}
  ]},
  {label:'编辑(&E)',submenu:[action('撤销','undoBtn','Ctrl+Z'),action('恢复','redoBtn','Ctrl+Shift+Z'),{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
  {label:'视图(&V)',submenu:[action('三维只读视窗','openThreeView'),{type:'separator'},action('地图放大','zoomIn'),action('地图缩小','zoomOut'),{role:'togglefullscreen',label:'全屏',accelerator:'F11'}]},
  {label:'图层(&L)',submenu:[action('导入底图…','baseImportBtn'),action('导入 Carto 图层…','cartoFolderBtn')]},
  {label:'资产(&A)',submenu:[{label:'资产提取器…',click:openExtractor},{type:'separator'},action('导入建筑资产包…','importBuildingLibrary'),action('资产包管理…','manageAssetPacks')]},
  {label:'工具(&T)',submenu:[action('选择','selectTool'),action('平移','panTool'),action('测距','measureTool'),{type:'separator'},action('工程设置…','projectBtn')]},
  {label:'帮助(&H)',submenu:[action('操作说明','helpBtn','F1'),{label:'关于',click:()=>require('electron').dialog.showMessageBox(win,{type:'info',title:'关于',message:'天际线Ⅱ地图规划设计器',detail:'绿色免安装版 0.1\n运行时 Electron '+process.versions.electron+'\n程序与项目可随整个文件夹迁移。'})}]}
 ];
};
