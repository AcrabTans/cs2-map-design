use std::{ffi::{c_char, c_void, CStr}, os::windows::ffi::OsStrExt, sync::OnceLock};
use tauri::ipc::{InvokeBody, Request, Response};

type Ptr = *mut c_void;
type Result<T> = std::result::Result<T, String>;

#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryExW(path: *const u16, file: Ptr, flags: u32) -> Ptr;
    fn GetProcAddress(module: Ptr, name: *const c_char) -> Ptr;
}

fn load(name: &str) -> Result<Ptr> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let path = executable.parent().ok_or("无法定位程序目录")?.join("asset-codecs").join(name);
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
    // Resolve bundled dependencies next to this DLL, with system DLLs as fallback.
    let handle = unsafe { LoadLibraryExW(wide.as_ptr(), std::ptr::null_mut(), 0x100 | 0x800) };
    if handle.is_null() {
        return Err(format!("无法加载资产提取组件 {name}：{}", std::io::Error::last_os_error()));
    }
    Ok(handle)
}

fn symbol(module: Ptr, name: &CStr) -> Result<Ptr> {
    let address = unsafe { GetProcAddress(module, name.as_ptr()) };
    if address.is_null() { return Err(format!("资产提取组件缺少函数 {}", name.to_string_lossy())); }
    Ok(address)
}

macro_rules! native_api {
    ($name:ident, $dll:literal, {$($field:ident : fn($($arg:ty),*) -> $ret:ty = $export:literal),* $(,)?}) => {
        struct $name { $($field: unsafe extern "C" fn($($arg),*) -> $ret),* }
        impl $name {
            fn get() -> Result<&'static Self> {
                static API: OnceLock<Result<$name>> = OnceLock::new();
                API.get_or_init(|| {
                    let module = load($dll)?;
                    Ok(Self { $($field: unsafe {
                        std::mem::transmute::<Ptr, unsafe extern "C" fn($($arg),*) -> $ret>(
                            symbol(module, CStr::from_bytes_with_nul(concat!($export, "\0").as_bytes()).unwrap())?
                        )
                    }),* })
                }).as_ref().map_err(Clone::clone)
            }
        }
    };
}

native_api!(Zstd, "zstd.dll", {
    bound: fn(*const u8, usize) -> u64 = "ZSTD_decompressBound",
    decompress: fn(*mut u8, usize, *const u8, usize) -> usize = "ZSTD_decompress",
    error: fn(usize) -> u32 = "ZSTD_isError",
});

native_api!(Geos, "geos_c.dll", {
    init: fn() -> Ptr = "GEOS_init_r",
    finish: fn(Ptr) -> () = "GEOS_finish_r",
    seq: fn(Ptr, *const f64, u32, i32, i32) -> Ptr = "GEOSCoordSeq_copyFromBuffer_r",
    ring: fn(Ptr, Ptr) -> Ptr = "GEOSGeom_createLinearRing_r",
    polygon: fn(Ptr, Ptr, *const Ptr, u32) -> Ptr = "GEOSGeom_createPolygon_r",
    collection: fn(Ptr, i32, *const Ptr, u32) -> Ptr = "GEOSGeom_createCollection_r",
    destroy: fn(Ptr, Ptr) -> () = "GEOSGeom_destroy_r",
    union: fn(Ptr, Ptr) -> Ptr = "GEOSUnaryUnion_r",
    union_prec: fn(Ptr, Ptr, f64) -> Ptr = "GEOSUnaryUnionPrec_r",
    bounds: fn(Ptr, Ptr, *mut f64, *mut f64, *mut f64, *mut f64) -> i32 = "GEOSGeom_getExtent_r",
    difference: fn(Ptr, Ptr, Ptr) -> Ptr = "GEOSSymDifference_r",
    buffer: fn(Ptr, Ptr, f64, i32, i32, i32, f64) -> Ptr = "GEOSBufferWithStyle_r",
    simplify: fn(Ptr, Ptr, f64) -> Ptr = "GEOSTopologyPreserveSimplify_r",
    area: fn(Ptr, Ptr, *mut f64) -> i32 = "GEOSArea_r",
    valid: fn(Ptr, Ptr) -> i8 = "GEOSisValid_r",
    empty: fn(Ptr, Ptr) -> i8 = "GEOSisEmpty_r",
    kind: fn(Ptr, Ptr) -> i32 = "GEOSGeomTypeId_r",
    parts: fn(Ptr, Ptr) -> i32 = "GEOSGetNumGeometries_r",
    part: fn(Ptr, Ptr, i32) -> Ptr = "GEOSGetGeometryN_r",
    outer: fn(Ptr, Ptr) -> Ptr = "GEOSGetExteriorRing_r",
    holes: fn(Ptr, Ptr) -> i32 = "GEOSGetNumInteriorRings_r",
    hole: fn(Ptr, Ptr, i32) -> Ptr = "GEOSGetInteriorRingN_r",
    points: fn(Ptr, Ptr) -> Ptr = "GEOSGeom_getCoordSeq_r",
    point_count: fn(Ptr, Ptr, *mut u32) -> i32 = "GEOSCoordSeq_getSize_r",
    read_points: fn(Ptr, Ptr, *mut f64, i32, i32) -> i32 = "GEOSCoordSeq_copyToBuffer_r",
});

struct Context { api: &'static Geos, handle: Ptr }
impl Drop for Context {
    fn drop(&mut self) { unsafe { (self.api.finish)(self.handle) }; }
}
struct Shape<'a> { ctx: &'a Context, raw: Ptr }
impl Drop for Shape<'_> {
    fn drop(&mut self) { unsafe { (self.ctx.api.destroy)(self.ctx.handle, self.raw) }; }
}
impl Context {
    fn shape(&self, raw: Ptr) -> Option<Shape<'_>> {
        (!raw.is_null()).then(|| Shape { ctx: self, raw })
    }
    fn area(&self, raw: Ptr) -> Option<f64> {
        let mut area = 0.0;
        let ok = unsafe { (self.api.area)(self.handle, raw, &mut area) };
        (ok == 1 && area.is_finite()).then_some(area)
    }
    fn valid(&self, raw: Ptr) -> bool {
        unsafe { (self.api.empty)(self.handle, raw) == 0 && (self.api.valid)(self.handle, raw) == 1 }
    }
    fn extent(&self, raw: Ptr) -> Option<[f64; 4]> {
        let (mut x0, mut y0, mut x1, mut y1) = (0.0, 0.0, 0.0, 0.0);
        let ok = unsafe { (self.api.bounds)(self.handle, raw, &mut x0, &mut y0, &mut x1, &mut y1) };
        (ok == 1).then_some([x0, y0, x1, y1])
    }
    fn merge(&self, input: Ptr) -> Option<Shape<'_>> {
        let (a, h) = (self.api, self.handle);
        if let Some(result) = self.shape(unsafe { (a.union)(h, input) }) { return Some(result); }
        let bounds = self.extent(input)?;
        for grid in [0.00001, 0.0001, 0.001] {
            let Some(fine) = self.shape(unsafe { (a.union_prec)(h, input, grid) }) else { continue };
            let Some(coarse) = self.shape(unsafe { (a.union_prec)(h, input, grid * 2.0) }) else { continue };
            if !self.valid(fine.raw) || !self.valid(coarse.raw) { continue; }
            let Some(extent) = self.extent(fine.raw) else { continue };
            if extent.into_iter().zip(bounds).any(|(x, y)| (x-y).abs() > grid*4.0) { continue; }
            let Some(diff) = self.shape(unsafe { (a.difference)(h, fine.raw, coarse.raw) }) else { continue };
            if self.area(diff.raw)? <= 0.01_f64.max(self.area(fine.raw)? * 0.001) { return Some(fine); }
        }
        None
    }
    fn collect_rings(&self, shape: Ptr, output: &mut Vec<Vec<[f64; 2]>>) -> Result<()> {
        let (a,h) = (self.api,self.handle);
        unsafe {
            match (a.kind)(h,shape) {
                3 => {
                    let holes = (a.holes)(h,shape);
                    if holes < 0 || output.len() + holes as usize + 1 > 512 { return Err("轮廓数量超过地图限制".into()); }
                    for index in -1..holes {
                        let ring = if index == -1 {(a.outer)(h,shape)} else {(a.hole)(h,shape,index)};
                        if ring.is_null() { return Err("读取建筑轮廓失败".into()); }
                        let coords = (a.points)(h,ring);
                        let mut count=0;
                        if coords.is_null() || (a.point_count)(h,coords,&mut count)!=1 || !(4..=5001).contains(&count) {
                            return Err("轮廓节点数量超过地图限制或无效".into());
                        }
                        let mut points=vec![[0.0;2];count as usize];
                        if (a.read_points)(h,coords,points.as_mut_ptr().cast(),0,0)!=1 { return Err("读取建筑轮廓坐标失败".into()); }
                        points.pop();
                        for [x,z] in &mut points {
                            *x=round(*x,10000.0);
                            *z=round(-*z,10000.0);
                        }
                        output.push(points);
                    }
                }
                6 => {
                    let count=(a.parts)(h,shape);
                    if !(1..=512).contains(&count) { return Err("建筑轮廓数量无效".into()); }
                    for i in 0..count {
                        let part=(a.part)(h,shape,i);
                        if part.is_null() { return Err("读取建筑轮廓失败".into()); }
                        self.collect_rings(part,output)?;
                    }
                }
                _ => return Err("建筑投影未形成多边形".into()),
            }
        }
        Ok(())
    }
}
fn round(value: f64, scale: f64) -> f64 { (value*scale).round()/scale + 0.0 }

#[derive(serde::Serialize)]
pub struct Projection { area: f64, rings: Vec<Vec<[f64; 2]>> }

fn project(bytes: &[u8]) -> Result<Projection> {
    const TRIANGLE_BYTES: usize = 48;
    if bytes.is_empty() || bytes.len() % TRIANGLE_BYTES != 0 || bytes.len()/TRIANGLE_BYTES > 1_000_000 {
        return Err("建筑投影三角形数量无效或超过上限".into());
    }
    let api=Geos::get()?;
    let h=unsafe { (api.init)() };
    if h.is_null() { return Err("无法启动轮廓计算组件".into()); }
    let ctx=Context { api, handle:h };
    let mut triangles=Vec::with_capacity(bytes.len()/TRIANGLE_BYTES);
    for triangle in bytes.chunks_exact(TRIANGLE_BYTES) {
        let mut points=[0.0;8];
        for (i,value) in triangle.chunks_exact(8).enumerate() {
            points[i]=f64::from_le_bytes(value.try_into().unwrap());
        }
        if points.iter().any(|v|!v.is_finite()||v.abs()>1e7) { return Err("建筑投影坐标无效".into()); }
        points.copy_within(..2,6);
        let polygon=unsafe {
            let seq=(api.seq)(h,points.as_ptr(),4,0,0);
            if seq.is_null() { return Err("无法创建建筑投影坐标".into()); }
            let ring=(api.ring)(h,seq);
            if ring.is_null() { return Err("无法创建建筑投影线环".into()); }
            (api.polygon)(h,ring,std::ptr::null(),0)
        };
        triangles.push(ctx.shape(polygon).ok_or("无法创建建筑投影三角形")?);
    }
    let pointers: Vec<Ptr> = triangles.into_iter().map(|item| std::mem::ManuallyDrop::new(item).raw).collect();
    let collection=ctx.shape(unsafe { (api.collection)(h,7,pointers.as_ptr(),pointers.len() as u32) }).ok_or("无法合并建筑投影三角形")?;
    let merged=ctx.merge(collection.raw).ok_or("无法合并建筑投影轮廓")?;
    let raw_area=ctx.area(merged.raw).filter(|area| *area>0.0).ok_or("建筑投影面积无效")?;
    let buffered=ctx.shape(unsafe { (api.buffer)(h,merged.raw,0.002,8,1,2,5.0) });
    let healed=buffered.and_then(|shape| ctx.shape(unsafe { (api.buffer)(h,shape.raw,-0.002,8,1,2,5.0) }))
        .filter(|shape| ctx.valid(shape.raw)&&ctx.area(shape.raw).is_some_and(|area| (area-raw_area).abs()<0.02_f64.max(raw_area*0.002)));
    let source=healed.as_ref().unwrap_or(&merged);
    for tolerance in [0.05,0.01,0.002,0.0] {
        let Some(simple)=ctx.shape(unsafe { (api.simplify)(h,source.raw,tolerance) }) else { continue };
        let Some(area)=ctx.area(simple.raw) else { continue };
        if !ctx.valid(simple.raw)||(area-raw_area).abs()>0.1_f64.max(raw_area*0.01) { continue; }
        let mut rings=Vec::new();
        ctx.collect_rings(simple.raw,&mut rings)?;
        return Ok(Projection {area:round(area,100.0),rings});
    }
    Err("建筑投影精度校验失败".into())
}

fn decompress(bytes: &[u8]) -> Result<Response> {
    let api=Zstd::get()?;
    let bound=unsafe { (api.bound)(bytes.as_ptr(),bytes.len()) };
    if !(1..=128*1024*1024).contains(&bound) { return Err("网格解压数据无效或过大".into()); }
    let mut output=vec![0;bound as usize];
    let size=unsafe { (api.decompress)(output.as_mut_ptr(),output.len(),bytes.as_ptr(),bytes.len()) };
    if unsafe { (api.error)(size) }!=0 || size>output.len() { return Err("无法解压建筑网格".into()); }
    output.truncate(size);
    Ok(Response::new(output))
}

#[tauri::command]
pub async fn asset_zstd(request: Request<'_>) -> Result<Response> {
    let InvokeBody::Raw(bytes)=request.body() else { return Err("网格数据格式无效".into()); };
    let bytes=bytes.clone();
    tauri::async_runtime::spawn_blocking(move || decompress(&bytes)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn asset_project(request: Request<'_>) -> Result<Projection> {
    let InvokeBody::Raw(bytes)=request.body() else { return Err("投影数据格式无效".into()); };
    let bytes=bytes.clone();
    tauri::async_runtime::spawn_blocking(move || project(&bytes)).await.map_err(|e| e.to_string())?
}
