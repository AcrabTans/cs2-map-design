fn main() {
    let source = std::path::Path::new("../vendor/asset-codecs");
    println!("cargo:rerun-if-changed={}", source.display());
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR"));
    let destination = out.ancestors().nth(3).expect("Cargo profile directory").join("asset-codecs");
    std::fs::create_dir_all(&destination).expect("create asset codec directory");
    for entry in std::fs::read_dir(source).expect("locate bundled asset codecs") {
        let entry = entry.expect("read asset codec entry");
        std::fs::copy(entry.path(), destination.join(entry.file_name())).expect("stage asset codec");
    }
    tauri_build::build();
}
