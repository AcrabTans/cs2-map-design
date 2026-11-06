use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{ipc::{InvokeBody, Request, Response}, State};

const MAX_FILE_SIZE: u64 = 512 * 1024 * 1024;
type Result<T> = std::result::Result<T, String>;

#[derive(Clone)]
struct Grant {
    path: PathBuf,
    directory: bool,
    writable: bool,
}

#[derive(Default)]
pub struct FileGrants(Mutex<HashMap<String, Grant>>);

#[derive(serde::Serialize)]
pub struct FileInfo {
    id: String,
    name: String,
    kind: &'static str,
    size: u64,
}

fn io_error(error: std::io::Error) -> String { error.to_string() }

impl Grant {
    fn info(&self, id: String) -> Result<FileInfo> {
        let size = match fs::metadata(&self.path) {
            Ok(meta) => meta.len(),
            Err(error) if self.writable && !self.directory && error.kind() == std::io::ErrorKind::NotFound => 0,
            Err(error) => return Err(io_error(error)),
        };
        Ok(FileInfo {
            id,
            name: self.path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
            kind: if self.directory { "directory" } else { "file" },
            size,
        })
    }

    fn check_file(&self) -> Result<()> {
        if self.directory { return Err("目标不是文件".into()); }
        if self.path.exists() {
            let resolved = self.path.canonicalize().map_err(io_error)?;
            if resolved != self.path || !resolved.is_file() {
                return Err("文件位置已改变，请重新选择".into());
            }
        }
        Ok(())
    }
}

impl FileGrants {
    fn grant(&self, path: PathBuf, directory: bool, writable: bool) -> Result<FileInfo> {
        let grant = Grant { path, directory, writable };
        let id = uuid::Uuid::new_v4().to_string();
        let info = grant.info(id.clone())?;
        self.0.lock().map_err(|_| "文件访问状态失效")?.insert(id, grant);
        Ok(info)
    }

    fn get(&self, id: &str) -> Result<Grant> {
        self.0.lock().map_err(|_| "文件访问状态失效")?.get(id).cloned()
            .ok_or_else(|| "文件访问已失效，请重新打开".into())
    }
}

fn dialog() -> rfd::FileDialog {
    let mut dialog = rfd::FileDialog::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let projects = dir.join("projects");
            dialog = dialog.set_directory(if projects.is_dir() { projects } else { dir.to_owned() });
        }
    }
    dialog
}

#[tauri::command]
pub async fn pick_files(kind: String, grants: State<'_, FileGrants>) -> Result<Option<Vec<FileInfo>>> {
    let assets = kind == "assets";
    let cok = kind == "cok";
    if !assets && !cok && kind != "project" { return Err("不支持的文件类型".into()); }
    let selected = tauri::async_runtime::spawn_blocking(move || {
        if assets {
            dialog().add_filter("建筑投影", &["cs2assets", "json"]).pick_files()
        } else if cok {
            dialog().add_filter("第三方建筑资产包", &["cok"]).pick_files()
        } else {
            dialog().add_filter("地图工程", &["cs2map", "json"]).pick_file().map(|p| vec![p])
        }
    }).await.map_err(|e| e.to_string())?;
    selected.map(|paths| paths.into_iter().map(|p| {
        grants.grant(p.canonicalize().map_err(io_error)?, false, !assets && !cok)
    }).collect()).transpose()
}

#[tauri::command]
pub async fn pick_directory(grants: State<'_, FileGrants>) -> Result<Option<FileInfo>> {
    let selected = tauri::async_runtime::spawn_blocking(|| dialog().pick_folder())
        .await.map_err(|e| e.to_string())?;
    selected.map(|p| grants.grant(p.canonicalize().map_err(io_error)?, true, true)).transpose()
}

#[tauri::command]
pub async fn pick_save(name: String, project: bool, grants: State<'_, FileGrants>) -> Result<Option<FileInfo>> {
    let name = Path::new(&name).file_name().unwrap_or_default().to_string_lossy().into_owned();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        let mut picker = dialog().set_file_name(&name);
        if project { picker = picker.add_filter("地图工程", &["cs2map"]); }
        picker.save_file()
    }).await.map_err(|e| e.to_string())?;
    selected.map(|p| {
        let path = if p.exists() { p.canonicalize().map_err(io_error)? } else {
            p.parent().ok_or("保存路径无效")?.canonicalize().map_err(io_error)?
                .join(p.file_name().ok_or("保存文件名无效")?)
        };
        grants.grant(path, false, true)
    }).transpose()
}

#[tauri::command]
pub fn file_stat(id: String, grants: State<'_, FileGrants>) -> Result<FileInfo> {
    grants.get(&id)?.info(id)
}

#[tauri::command]
pub async fn read_file(id: String, start: u64, end: u64, grants: State<'_, FileGrants>) -> Result<Response> {
    let grant = grants.get(&id)?;
    tauri::async_runtime::spawn_blocking(move || {
        grant.check_file()?;
        if end < start || end - start > MAX_FILE_SIZE { return Err("读取范围无效或过大".into()); }
        let mut file = match File::open(&grant.path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && grant.writable && end == 0 => return Ok(Response::new(Vec::<u8>::new())),
            Err(error) => return Err(io_error(error)),
        };
        if end > file.metadata().map_err(io_error)?.len() { return Err("文件大小已改变，请重新打开".into()); }
        file.seek(SeekFrom::Start(start)).map_err(io_error)?;
        let mut bytes = vec![0; (end - start) as usize];
        file.read_exact(&mut bytes).map_err(io_error)?;
        Ok(Response::new(bytes))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn write_file(request: Request<'_>, grants: State<'_, FileGrants>) -> Result<()> {
    let id = request.headers().get("x-file-token").and_then(|v| v.to_str().ok()).ok_or("缺少文件授权")?;
    let grant = grants.get(id)?;
    if !grant.writable { return Err("文件未授权写入".into()); }
    grant.check_file()?;
    let InvokeBody::Raw(bytes) = request.body() else { return Err("文件数据格式无效".into()); };
    if bytes.len() as u64 > MAX_FILE_SIZE { return Err("文件超过 512 MB".into()); }
    let parent = grant.path.parent().ok_or("保存路径无效")?;
    if parent.canonicalize().map_err(io_error)? != parent { return Err("保存目录已改变，请重新选择".into()); }
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(io_error)?;
    temporary.write_all(bytes).map_err(io_error)?;
    temporary.as_file().sync_all().map_err(io_error)?;
    temporary.persist(grant.path).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn directory_entries(id: String, grants: State<'_, FileGrants>) -> Result<Vec<FileInfo>> {
    let grant = grants.get(&id)?;
    if !grant.directory || grant.path.canonicalize().map_err(io_error)? != grant.path { return Err("目录位置已改变".into()); }
    let mut files = Vec::new();
    for entry in fs::read_dir(&grant.path).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        let kind = entry.file_type().map_err(io_error)?;
        if kind.is_symlink() || !(kind.is_dir() || kind.is_file()) { continue; }
        let path = entry.path().canonicalize().map_err(io_error)?;
        if path.parent() != Some(grant.path.as_path()) { continue; }
        files.push(grants.grant(path, kind.is_dir(), grant.writable)?);
    }
    Ok(files)
}

#[tauri::command]
pub fn directory_child(id: String, name: String, kind: String, create: bool, grants: State<'_, FileGrants>) -> Result<FileInfo> {
    let grant = grants.get(&id)?;
    let mut components = Path::new(&name).components();
    if !grant.directory || name.contains(['/', '\\', ':']) || !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err("子路径无效".into());
    }
    if !matches!(kind.as_str(), "directory" | "file") { return Err("不支持的文件类型".into()); }
    if grant.path.canonicalize().map_err(io_error)? != grant.path { return Err("目录位置已改变".into()); }
    let child = grant.path.join(&name);
    let directory = kind == "directory";
    if child.exists() {
        if child.canonicalize().map_err(io_error)? != child { return Err("不允许使用链接子路径".into()); }
    } else if create {
        if !grant.writable { return Err("目录未授权写入".into()); }
        if directory { fs::create_dir(&child).map_err(io_error)?; }
        else { OpenOptions::new().write(true).create_new(true).open(&child).map_err(io_error)?; }
    }
    let resolved = child.canonicalize().map_err(io_error)?;
    if resolved.parent() != Some(grant.path.as_path()) || resolved.is_dir() != directory {
        return Err("子路径类型或位置无效".into());
    }
    grants.grant(resolved, directory, grant.writable)
}

#[tauri::command]
pub async fn write_extracted_asset(directory: String, name: String, library: String, grants: State<'_, FileGrants>) -> Result<String> {
    let grant=grants.get(&directory)?;
    tauri::async_runtime::spawn_blocking(move || {
        if !grant.directory || !grant.writable || grant.path.canonicalize().map_err(io_error)? != grant.path {
            return Err("输出目录已改变，请重新选择".into());
        }
        if name.contains(['/', '\\', ':']) || Path::new(&name).file_name().and_then(|v|v.to_str())!=Some(name.as_str()) {
            return Err("资产输出文件名无效".into());
        }
        let stem=name.strip_suffix(".cs2assets").filter(|s| !s.is_empty()).ok_or("资产输出扩展名无效")?;
        if library.len()>MAX_FILE_SIZE as usize {return Err("资产库数据过大".into());}
        let mut temporary=tempfile::NamedTempFile::new_in(&grant.path).map_err(io_error)?;
        temporary.write_all(library.as_bytes()).map_err(io_error)?;
        temporary.as_file().sync_all().map_err(io_error)?;
        for number in 1..1000 {
            let output=if number==1 {name.clone()} else {format!("{stem} ({number}).cs2assets")};
            match temporary.persist_noclobber(grant.path.join(&output)) {
                Ok(_) => return Ok(output),
                Err(error) if error.error.kind()==std::io::ErrorKind::AlreadyExists => temporary=error.file,
                Err(error) => return Err(error.error.to_string()),
            }
        }
        Err("输出目录中同名文件过多".into())
    }).await.map_err(|e|e.to_string())?
}
