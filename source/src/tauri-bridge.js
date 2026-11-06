// The renderer uses the same picker contract in Tauri and in the browser.
if (window.__TAURI__) {
  const {core, event} = window.__TAURI__;
  const invoke = (command, args, options) => core.invoke(command, args, options);
  const action = (label, key, accelerator, setting) => ({label, key, accelerator, setting});
  const separator = {type:'separator'};
  const menus = [
    {label:'文件',submenu:[action('新建工程','newProjectBtn','Ctrl+N'),action('打开工程…','openProjectTop','Ctrl+O'),action('打开项目文件夹…','openProjectFolderTop'),separator,action('保存','saveProjectTop','Ctrl+S'),action('另存为…','saveAsProjectTop','Ctrl+Shift+S'),action('工程设置…','projectBtn'),separator,action('导入 Carto 文件夹…','cartoFolderBtn'),action('导出 Carto…','exportCartoBtn'),action('导出 PNG…','exportPngBtn'),separator,action('退出','close-app')]},
    {label:'编辑',submenu:[action('撤销','undoBtn','Ctrl+Z'),action('恢复','redoBtn','Ctrl+Shift+Z'),separator,action('剪切','edit-cut'),action('复制','edit-copy'),action('粘贴','edit-paste'),action('全选','edit-selectAll'),separator,action('显示 500 m 参考网格','gridToggle',null,'gridToggle'),action('断点 / 节点吸附','snapToggle',null,'snapToggle'),action('显示名称与标签','notesVisible',null,'notesVisible'),action('显示路网预留走廊','corridorsToggle',null,'corridorsToggle'),separator,action('地图放大','zoomIn'),action('地图缩小','zoomOut'),action('全屏','fullscreen-app','F11')]},
    {label:'图层',submenu:[action('图层管理…','manageLayers'),action('底图管理…','manageBasemaps'),action('区块透明度…','zoneOpacitySettings'),separator,action('导入底图…','baseImportBtn'),action('导入 Carto 图层…','cartoFolderBtn'),separator,action('叠加导入手绘规划…','importPlanning'),action('单独导出手绘规划…','exportPlanning')]},
    {label:'资产',submenu:[action('内置本体建筑…','openBuiltinAssets'),action('导入建筑资产包…','importBuildingLibrary'),action('资产包管理…','manageAssetPacks')]},
    {label:'工具',submenu:[action('取名工具…','openNamingTool'),action('资产提取…','openAssetExtractor')]},
    {label:'帮助',submenu:[action('操作说明','helpBtn','F1'),action('关于','aboutApp')]}
  ];
  let closeHandler, closing = false;
  async function requestClose() {
    if (closing || !closeHandler) return;
    closing = true;
    try { await closeHandler(); }
    finally { closing = false; }
  }
  window.mapDesktop = {
    tauri:true,
    menus:async () => menus,
    menuAction(key) {
      if (key === 'close-app') return requestClose();
      if (key === 'fullscreen-app') return invoke('toggle_fullscreen');
      if (key.startsWith('edit-')) return document.execCommand(key.slice(5));
      const button = document.getElementById(key);
      if (button && !button.disabled && !document.querySelector('dialog[open]')) button.click();
    },
    async onClose(callback) {
      closeHandler = callback;
      await event.listen('mapdesign-close', requestClose);
      await invoke('enable_close_guard');
    },
    openReference:key=>invoke('open_reference',{key}),
    confirmDiscard:() => invoke('confirm_discard'),
    exit:() => invoke('exit_app'),
    setTitle:title => invoke('update_title', {title}),
    pick:kind => kind === 'directory' ? invoke('pick_directory') : invoke('pick_files', {kind}),
    savePick:name => invoke('pick_save', {name, project:true}),
    exportPick:name => invoke('pick_save', {name, project:false}),
    stat:id => invoke('file_stat', {id}),
    read:(id,start,end) => invoke('read_file', {id,start,end}),
    write:(id,bytes) => invoke('write_file', bytes, {headers:{'X-File-Token':id}}),
    assetCodecs:{
      decompress:async bytes=>new Uint8Array(await invoke('asset_zstd',bytes)),
      project:bytes=>invoke('asset_project',bytes)
    },
    writeExtractedAsset:(directory,name,library)=>invoke('write_extracted_asset',{directory,name,library}),
    entries:id => invoke('directory_entries', {id}),
    child:(id,name,kind,create) => invoke('directory_child', {id,name,kind,create})
  };
}
