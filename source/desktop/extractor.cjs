const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
let running=null;
exports.launchExtractor=async(root,win)=>{
 const {dialog}=require('electron');
 if(running){await dialog.showMessageBox(win,{type:'info',message:'资产提取器已打开，请切换到提取器窗口。'});return;}
 const folder=path.join(root,'tools','资产提取器'),runtime=path.join(folder,'runtime','python');
 try{
  const python=path.join(runtime,'pythonw.exe'),script=path.join(folder,'launch.py');
  fs.accessSync(python);fs.accessSync(script);fs.mkdirSync(path.join(folder,'output'),{recursive:true});
  const child=spawn(python,[script],{cwd:folder,windowsHide:true,stdio:'ignore',env:{...process.env,PYTHONHOME:runtime,PYTHONPATH:path.join(folder,'依赖','python'),PYTHONNOUSERSITE:'1',CS2_PYTHON:path.join(runtime,'python.exe'),CS2_NODE:process.execPath,ELECTRON_RUN_AS_NODE:'1'}});
  running=child;
  child.once('error',error=>{running=null;dialog.showMessageBox(win,{type:'error',message:'资产提取器启动失败',detail:error.message});});
  child.once('exit',code=>{running=null;if(code)dialog.showMessageBox(win,{type:'error',message:'资产提取器未正常退出',detail:'请查看 '+path.join(folder,'startup-error.log')});});
  child.unref();
 }catch(error){await dialog.showMessageBox(win,{type:'error',message:'无法启动内置资产提取器',detail:error.message});}
};
