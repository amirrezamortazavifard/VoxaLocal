use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use flate2::read::GzDecoder;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelMetadataDto {
    pub format_version: String,
    pub tensor_count: usize,
    pub total_parameters: u64,
    pub int4_tensors: usize,
    pub int8_tensors: usize,
    pub fp32_tensors: usize,
    pub quant_group_size: Option<usize>,
    pub vocab_size: usize,
    pub n_stacks: Option<i32>,
    pub pos_dim: Option<i32>,
    pub chunk_frames: Option<i32>,
    pub chunk_ms: Option<i32>,
    pub sample_rate: u32,
    pub hyperparameters: Vec<(String, i32)>,
    pub text_rules: Vec<(String, String)>,
}

impl From<tinyasr::TzfMetadata> for ModelMetadataDto {
    fn from(m: tinyasr::TzfMetadata) -> Self {
        let chunk_ms = m.chunk_frames.map(|c| c * 20);
        Self {
            format_version: m.format_version,
            tensor_count: m.tensor_count,
            total_parameters: m.total_parameters,
            int4_tensors: m.int4_tensors,
            int8_tensors: m.int8_tensors,
            fp32_tensors: m.fp32_tensors,
            quant_group_size: m.quant_group_size,
            vocab_size: m.vocab_size,
            n_stacks: m.n_stacks,
            pos_dim: m.pos_dim,
            chunk_frames: m.chunk_frames,
            chunk_ms,
            sample_rate: 16000,
            hyperparameters: m.hyperparameters,
            text_rules: m.text_rules,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModelEntry {
    pub filename: String,
    pub size_bytes: u64,
    pub is_active: bool,
    pub is_loaded: bool,
    pub languages: Vec<String>,
    pub metadata: Option<ModelMetadataDto>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub is_installed: bool,
    pub is_loaded: bool,
    pub asr_filename: Option<String>,
    pub vad_filename: Option<String>,
    pub asr_size_bytes: u64,
    pub vad_size_bytes: u64,
    pub version: u32,
    pub languages: Vec<String>,
    pub parameter_count_millions: f32,
    pub status: String, // "not_installed" | "ready" | "loaded" | "error"
    pub error_message: Option<String>,
    pub metadata: Option<ModelMetadataDto>,
}

impl Default for ModelInfo {
    fn default() -> Self {
        Self {
            is_installed: false,
            is_loaded: false,
            asr_filename: None,
            vad_filename: None,
            asr_size_bytes: 0,
            vad_size_bytes: 0,
            version: 4,
            languages: vec!["fa".to_string(), "en".to_string()],
            parameter_count_millions: 60.0,
            status: "not_installed".to_string(),
            error_message: None,
            metadata: None,
        }
    }
}

pub struct ModelManager {
    models_dir: PathBuf,
    active_asr_filename: RwLock<String>,
    loaded_models: Arc<RwLock<Option<Arc<tinyasr::Models>>>>,
    info: Arc<RwLock<ModelInfo>>,
    pub download_cancel: Arc<AtomicBool>,
}

fn decompress_if_gzipped(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.starts_with(&[0x1f, 0x8b]) {
        let mut decoder = GzDecoder::new(bytes);
        let mut out = Vec::new();
        decoder
            .read_to_end(&mut out)
            .map_err(|e| format!("Failed to decompress gzip archive: {e}"))?;
        Ok(out)
    } else {
        Ok(bytes.to_vec())
    }
}

impl ModelManager {
    pub fn new(app_local_data_dir: &Path) -> Self {
        let models_dir = app_local_data_dir.join("models");
        let _ = fs::create_dir_all(&models_dir);

        let manager = Self {
            models_dir,
            active_asr_filename: RwLock::new("en-fa.tzf".to_string()),
            loaded_models: Arc::new(RwLock::new(None)),
            info: Arc::new(RwLock::new(ModelInfo::default())),
            download_cancel: Arc::new(AtomicBool::new(false)),
        };

        manager.refresh_status();
        manager
    }

    pub fn auto_unpack_bundled_models(&self, search_paths: &[std::path::PathBuf]) -> bool {
        let dest_asr = self.models_dir.join("en-fa.tzf");
        let dest_vad = self.models_dir.join("silero_vad.onnx");

        if dest_asr.exists() && dest_vad.exists() {
            log::info!("AI model files already present in AppData: {:?}", self.models_dir);
            return true;
        }

        log::info!("Searching for pre-packaged AI models in bundle resources...");
        for base in search_paths {
            if !base.exists() {
                continue;
            }

            let asr_candidates = [
                base.join("en-fa.tzf"),
                base.join("en-fa.tzf.gz"),
                base.join("models").join("en-fa.tzf"),
                base.join("models").join("en-fa.tzf.gz"),
            ];

            let vad_candidates = [
                base.join("silero_vad.onnx"),
                base.join("silero_vad.onnx.gz"),
                base.join("models").join("silero_vad.onnx"),
                base.join("models").join("silero_vad.onnx.gz"),
            ];

            let found_asr = asr_candidates.into_iter().find(|p| p.is_file());
            let found_vad = vad_candidates.into_iter().find(|p| p.is_file());

            if let (Some(asr_path), Some(vad_path)) = (found_asr, found_vad) {
                log::info!(
                    "Found bundled models: {:?} and {:?}. Auto-installing into AppData...",
                    asr_path,
                    vad_path
                );
                match self.import_model_files(&asr_path, &vad_path) {
                    Ok(_) => {
                        log::info!("Bundled models successfully unpacked and verified into AppData.");
                        return true;
                    }
                    Err(e) => {
                        log::warn!("Failed to unpack bundled models from {:?}: {e}", base);
                    }
                }
            }
        }

        log::warn!("No bundled AI models found across search paths.");
        false
    }

    pub fn models_dir(&self) -> &Path {
        &self.models_dir
    }

    pub fn loaded_models(&self) -> Option<Arc<tinyasr::Models>> {
        self.loaded_models.read().clone()
    }

    pub fn get_info(&self) -> ModelInfo {
        self.info.read().clone()
    }

    pub fn active_filename(&self) -> String {
        self.active_asr_filename.read().clone()
    }

    pub fn set_active_filename(&self, filename: &str) {
        if self.models_dir.join(filename).exists() {
            *self.active_asr_filename.write() = filename.to_string();
            self.refresh_status();
        }
    }

    pub fn refresh_status(&self) {
        let active_name = self.active_asr_filename.read().clone();
        let asr_path = self.models_dir.join(&active_name);
        let vad_path = self.models_dir.join("silero_vad.onnx");

        let mut info = self.info.write();
        let is_loaded = self.loaded_models.read().is_some();

        if asr_path.exists() && vad_path.exists() {
            let asr_size = fs::metadata(&asr_path).map(|m| m.len()).unwrap_or(0);
            let vad_size = fs::metadata(&vad_path).map(|m| m.len()).unwrap_or(0);

            info.is_installed = true;
            info.is_loaded = is_loaded;
            info.asr_filename = Some(active_name);
            info.vad_filename = Some("silero_vad.onnx".to_string());
            info.asr_size_bytes = asr_size;
            info.vad_size_bytes = vad_size;
            info.status = if is_loaded { "loaded".to_string() } else { "ready".to_string() };
            info.error_message = None;

            if info.metadata.is_none() {
                if let Ok(bytes) = fs::read(&asr_path) {
                    if let Ok(meta) = tinyasr::inspect_tzf_metadata(&bytes) {
                        info.parameter_count_millions =
                            (meta.total_parameters as f32 / 1_000_000.0 * 10.0).round() / 10.0;
                        info.metadata = Some(meta.into());
                    }
                }
            }
        } else {
            info.is_installed = false;
            info.is_loaded = false;
            info.status = "not_installed".to_string();
            info.error_message = None;
        }
    }

    pub fn import_model_files(&self, asr_source: &Path, vad_source: &Path) -> Result<ModelInfo, String> {
        log::info!("Importing ASR model from {:?} and VAD from {:?}", asr_source, vad_source);

        let asr_bytes = fs::read(asr_source)
            .map_err(|e| format!("Failed to read ASR model file at {:?}: {e}", asr_source))?;
        let vad_bytes = fs::read(vad_source)
            .map_err(|e| format!("Failed to read VAD model file at {:?}: {e}", vad_source))?;

        let asr_decompressed = decompress_if_gzipped(&asr_bytes)?;
        let vad_decompressed = decompress_if_gzipped(&vad_bytes)?;

        // Validate ASR header
        if asr_decompressed.len() < 4 {
            return Err("ASR model file is too short to be valid".to_string());
        }
        let magic = &asr_decompressed[0..4];
        if magic != b"TZF1" && magic != b"TZF2" && magic != b"TZF3" && magic != b"TZF4" {
            return Err(format!(
                "Invalid ASR model file header: expected TZF1-TZF4, found {:?}",
                String::from_utf8_lossy(magic)
            ));
        }

        // Validate VAD ONNX model
        tinyasr::Vad::from_onnx(&vad_decompressed)
            .map_err(|e| format!("Silero VAD ONNX validation failed: {e}"))?;

        // Test loading both to ensure complete compatibility
        let test_models = tinyasr::Models::load(tinyasr::Files {
            asr: &asr_decompressed,
            vad: &vad_decompressed,
        }).map_err(|e| format!("Failed to initialize TinyASR models: {e}"))?;

        let langs: Vec<String> = test_models.langs().into_iter().map(|s| s.to_string()).collect();

        // Write uncompressed verified models to local application directory
        let dest_asr = self.models_dir.join("en-fa.tzf");
        let dest_vad = self.models_dir.join("silero_vad.onnx");

        let mut f_asr = File::create(&dest_asr)
            .map_err(|e| format!("Failed to create destination ASR file at {:?}: {e}", dest_asr))?;
        f_asr.write_all(&asr_decompressed)
            .map_err(|e| format!("Failed to write ASR model: {e}"))?;

        let mut f_vad = File::create(&dest_vad)
            .map_err(|e| format!("Failed to create destination VAD file at {:?}: {e}", dest_vad))?;
        f_vad.write_all(&vad_decompressed)
            .map_err(|e| format!("Failed to write VAD model: {e}"))?;

        let mut info = self.info.write();
        info.is_installed = true;
        info.asr_filename = Some("en-fa.tzf".to_string());
        info.vad_filename = Some("silero_vad.onnx".to_string());
        info.asr_size_bytes = asr_decompressed.len() as u64;
        info.vad_size_bytes = vad_decompressed.len() as u64;
        info.languages = langs;
        info.version = tinyasr::version();
        info.status = "ready".to_string();
        info.error_message = None;

        log::info!("Model files successfully imported and validated.");
        Ok(info.clone())
    }

    pub fn load_models(&self, threads: usize) -> Result<(), String> {
        let active_name = self.active_asr_filename.read().clone();
        let asr_path = self.models_dir.join(&active_name);
        let vad_path = self.models_dir.join("silero_vad.onnx");

        if !asr_path.exists() || !vad_path.exists() {
            return Err(format!(
                "Model files are not installed. Please ensure {} and silero_vad.onnx are installed.",
                active_name
            ));
        }

        let asr_bytes = fs::read(&asr_path)
            .map_err(|e| format!("Failed to read ASR model from {:?}: {e}", asr_path))?;
        let vad_bytes = fs::read(&vad_path)
            .map_err(|e| format!("Failed to read VAD model from {:?}: {e}", vad_path))?;

        let meta_dto = tinyasr::inspect_tzf_metadata(&asr_bytes).ok().map(ModelMetadataDto::from);

        let mut models = tinyasr::Models::load(tinyasr::Files {
            asr: &asr_bytes,
            vad: &vad_bytes,
        }).map_err(|e| format!("Failed to load TinyASR models: {e}"))?;

        if threads > 1 {
            models.set_threads(threads);
        }

        let langs: Vec<String> = models.langs().into_iter().map(|s| s.to_string()).collect();

        *self.loaded_models.write() = Some(Arc::new(models));

        let mut info = self.info.write();
        info.is_installed = true;
        info.is_loaded = true;
        info.asr_filename = Some(active_name.clone());
        info.asr_size_bytes = asr_bytes.len() as u64;
        info.vad_size_bytes = vad_bytes.len() as u64;
        info.languages = langs;
        if let Some(ref m) = meta_dto {
            info.parameter_count_millions =
                (m.total_parameters as f32 / 1_000_000.0 * 10.0).round() / 10.0;
        }
        info.metadata = meta_dto;
        info.status = "loaded".to_string();
        info.error_message = None;

        log::info!("TinyASR model '{}' successfully loaded with {} threads.", active_name, threads);
        Ok(())
    }

    pub fn set_active_model(&self, filename: &str, threads: usize) -> Result<ModelInfo, String> {
        let target_path = self.models_dir.join(filename);
        if !target_path.exists() {
            return Err(format!("Model '{}' is not installed", filename));
        }
        *self.active_asr_filename.write() = filename.to_string();
        self.load_models(threads)?;
        Ok(self.get_info())
    }

    pub fn install_asr_model_bytes(&self, target_filename: &str, raw_or_gz_bytes: &[u8]) -> Result<InstalledModelEntry, String> {
        let decompressed = decompress_if_gzipped(raw_or_gz_bytes)?;
        if decompressed.len() < 4 {
            return Err("Downloaded model file is too short to be valid".to_string());
        }
        let magic = &decompressed[0..4];
        if !matches!(magic, b"TZF1" | b"TZF2" | b"TZF3" | b"TZF4" | b"TZF5") {
            return Err(format!(
                "Invalid ASR model header: expected TZF1-TZF5, found {:?}",
                String::from_utf8_lossy(magic)
            ));
        }

        let vad_path = self.models_dir.join("silero_vad.onnx");
        if !vad_path.exists() {
            return Err("Silero VAD model (silero_vad.onnx) is missing".to_string());
        }
        let vad_bytes = fs::read(&vad_path)
            .map_err(|e| format!("Failed to read silero_vad.onnx: {e}"))?;

        let test_models = tinyasr::Models::load(tinyasr::Files {
            asr: &decompressed,
            vad: &vad_bytes,
        })
        .map_err(|e| format!("Model integrity check failed: {e}"))?;

        let langs: Vec<String> = test_models.langs().into_iter().map(|s| s.to_string()).collect();
        let meta = tinyasr::inspect_tzf_metadata(&decompressed).ok().map(ModelMetadataDto::from);

        let clean_name = target_filename.trim_end_matches(".gz").to_string();
        let dest_path = self.models_dir.join(&clean_name);
        let mut f = File::create(&dest_path)
            .map_err(|e| format!("Failed to create model file {:?}: {e}", dest_path))?;
        f.write_all(&decompressed)
            .map_err(|e| format!("Failed to write model file: {e}"))?;

        let active = self.active_asr_filename.read().clone() == clean_name;
        let loaded = active && self.loaded_models.read().is_some();

        log::info!("Installed new ASR model '{}' ({:?})", clean_name, langs);
        Ok(InstalledModelEntry {
            filename: clean_name,
            size_bytes: decompressed.len() as u64,
            is_active: active,
            is_loaded: loaded,
            languages: langs,
            metadata: meta,
        })
    }

    pub fn delete_installed_model(&self, filename: &str) -> Result<(), String> {
        let active = self.active_asr_filename.read().clone();
        if filename == active {
            return Err("Cannot delete the currently active model. Switch to another model first.".to_string());
        }
        let path = self.models_dir.join(filename);
        if !path.exists() {
            return Err(format!("Model '{}' not found", filename));
        }
        fs::remove_file(&path).map_err(|e| format!("Failed to delete model '{}': {e}", filename))?;
        Ok(())
    }

    pub fn list_installed_models(&self) -> Vec<InstalledModelEntry> {
        let active = self.active_asr_filename.read().clone();
        let is_loaded = self.loaded_models.read().is_some();
        let vad_bytes = fs::read(self.models_dir.join("silero_vad.onnx")).ok();

        let mut entries = Vec::new();
        if let Ok(read_dir) = fs::read_dir(&self.models_dir) {
            for entry in read_dir.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("tzf") {
                    continue;
                }
                let filename = match path.file_name().and_then(|n| n.to_str()) {
                    Some(n) => n.to_string(),
                    None => continue,
                };
                let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                let raw = fs::read(&path).ok();
                let meta = raw
                    .as_deref()
                    .and_then(|b| tinyasr::inspect_tzf_metadata(b).ok())
                    .map(ModelMetadataDto::from);

                let mut languages: Vec<String> = Vec::new();
                if let (Some(ref r), Some(ref vad)) = (&raw, &vad_bytes) {
                    if let Ok(m) = tinyasr::Models::load(tinyasr::Files { asr: r, vad }) {
                        languages = m.langs().into_iter().map(|s| s.to_string()).collect();
                    }
                }
                if languages.is_empty() {
                    if let Some(ref m) = meta {
                        for (k, v) in &m.text_rules {
                            if k.starts_with("lang.") && k.matches('.').count() == 1 {
                                languages.push(v.clone());
                            }
                        }
                    }
                }

                let is_active = filename == active;
                entries.push(InstalledModelEntry {
                    filename,
                    size_bytes,
                    is_active,
                    is_loaded: is_active && is_loaded,
                    languages,
                    metadata: meta,
                });
            }
        }

        entries.sort_by(|a, b| b.is_active.cmp(&a.is_active).then_with(|| a.filename.cmp(&b.filename)));
        entries
    }

    pub fn unload_models(&self) {
        *self.loaded_models.write() = None;
        let mut info = self.info.write();
        info.is_loaded = false;
        info.status = if info.is_installed { "ready".to_string() } else { "not_installed".to_string() };
        log::info!("TinyASR models unloaded.");
    }
}
