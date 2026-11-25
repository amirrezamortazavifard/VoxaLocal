use std::path::{Path, PathBuf};

use sherpa_onnx::{KeywordSpotter, KeywordSpotterConfig, OnlineStream};

pub trait WakeWordDetector: Send {
    fn accept_samples(&mut self, samples_16k: &[f32]) -> Option<String>;
    fn reset(&mut self);
}

#[derive(Debug, Clone)]
pub struct WakeWordModelPaths {
    pub dir: PathBuf,
    pub encoder: PathBuf,
    pub decoder: PathBuf,
    pub joiner: PathBuf,
    pub tokens: PathBuf,
    pub keywords_file: PathBuf,
}

impl WakeWordModelPaths {
    pub fn from_dir(dir: &Path) -> Result<Self, String> {
        if !dir.is_dir() {
            return Err(format!(
                "Wake word model directory does not exist: {}",
                dir.display()
            ));
        }

        let encoder = pick_model_file(
            dir,
            &[
                "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
                "encoder-epoch-12-avg-2-chunk-16-left-64.onnx",
            ],
            "encoder",
        )?;
        let decoder = pick_model_file(
            dir,
            &[
                "decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
                "decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
            ],
            "decoder",
        )?;
        let joiner = pick_model_file(
            dir,
            &[
                "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
                "joiner-epoch-12-avg-2-chunk-16-left-64.onnx",
            ],
            "joiner",
        )?;

        let tokens = dir.join("tokens.txt");
        ensure_non_empty_file(&tokens, "tokens.txt")?;

        let keywords_file = dir.join("keywords.txt");
        ensure_non_empty_file(&keywords_file, "keywords.txt")?;

        let keywords_text = std::fs::read_to_string(&keywords_file)
            .map_err(|e| format!("Failed to read {}: {e}", keywords_file.display()))?;
        let active_lines: Vec<&str> = keywords_text
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty() && !line.starts_with('#'))
            .collect();
        if active_lines.is_empty() {
            return Err(format!(
                "Wake word file {} contains no keywords.",
                keywords_file.display()
            ));
        }
        if active_lines.iter().any(|line| line.contains("<unk>")) {
            return Err(format!(
                "Wake word file {} contains invalid <unk> BPE token.",
                keywords_file.display()
            ));
        }

        Ok(Self {
            dir: dir.to_path_buf(),
            encoder,
            decoder,
            joiner,
            tokens,
            keywords_file,
        })
    }

    pub fn resolve(
        app_data_dir: Option<&Path>,
        resource_dir: Option<&Path>,
    ) -> Result<Self, String> {
        let mut candidates = Vec::new();

        if let Some(res) = resource_dir {
            candidates.push(res.join("models").join("wakeword"));
            candidates.push(res.join("_up_").join("models").join("wakeword"));
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                candidates.push(exe_dir.join("models").join("wakeword"));
                candidates.push(exe_dir.join("resources").join("models").join("wakeword"));
            }
        }
        if let Some(data_dir) = app_data_dir {
            candidates.push(data_dir.join("models").join("wakeword"));
        }

        // Local development fallbacks
        candidates.push(PathBuf::from("src-tauri/models/wakeword"));
        candidates.push(PathBuf::from("models/wakeword"));
        candidates.push(PathBuf::from("../src-tauri/models/wakeword"));
        if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
            candidates.push(PathBuf::from(manifest_dir).join("models").join("wakeword"));
        }

        let mut errors = Vec::new();
        for dir in candidates {
            if dir.is_dir() {
                match Self::from_dir(&dir) {
                    Ok(paths) => return Ok(paths),
                    Err(e) => errors.push(format!("{}: {e}", dir.display())),
                }
            }
        }

        if errors.is_empty() {
            Err("Bundled wake word model files not found in models/wakeword.".to_string())
        } else {
            Err(format!(
                "Wake word model validation failed: {}",
                errors.join("; ")
            ))
        }
    }
}

fn ensure_non_empty_file(path: &Path, label: &str) -> Result<(), String> {
    let meta = std::fs::metadata(path).map_err(|_| {
        format!(
            "Required wake word file missing: {label} ({})",
            path.display()
        )
    })?;
    if !meta.is_file() || meta.len() == 0 {
        return Err(format!(
            "Wake word file is empty or invalid: {label} ({})",
            path.display()
        ));
    }
    Ok(())
}

fn pick_model_file(dir: &Path, preferred: &[&str], role: &str) -> Result<PathBuf, String> {
    for name in preferred {
        let candidate = dir.join(name);
        if let Ok(meta) = std::fs::metadata(&candidate) {
            if meta.is_file() && meta.len() > 0 {
                return Ok(candidate);
            }
        }
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut fallback = None;
        for entry in entries.flatten() {
            let path = entry.path();
            let fname = entry.file_name().to_string_lossy().to_lowercase();
            if path.is_file() && fname.contains(role) && fname.ends_with(".onnx") {
                if fname.contains(".int8.") {
                    return Ok(path);
                }
                fallback = Some(path);
            }
        }
        if let Some(path) = fallback {
            return Ok(path);
        }
    }

    Err(format!(
        "Required wake word {role} ONNX file missing in {}",
        dir.display()
    ))
}

pub struct SherpaKwsDetector {
    spotter: KeywordSpotter,
    stream: OnlineStream,
}

impl SherpaKwsDetector {
    pub fn from_paths(
        paths: &WakeWordModelPaths,
        keywords_score: f32,
        keywords_threshold: f32,
    ) -> Result<Self, String> {
        let mut config = KeywordSpotterConfig::default();
        config.feat_config.sample_rate = 16000;
        config.feat_config.feature_dim = 80;
        config.model_config.transducer.encoder = Some(paths.encoder.to_string_lossy().into_owned());
        config.model_config.transducer.decoder = Some(paths.decoder.to_string_lossy().into_owned());
        config.model_config.transducer.joiner = Some(paths.joiner.to_string_lossy().into_owned());
        config.model_config.tokens = Some(paths.tokens.to_string_lossy().into_owned());
        config.model_config.num_threads = 1;
        config.model_config.provider = Some("cpu".to_string());
        config.model_config.debug = false;
        config.max_active_paths = 4;
        config.num_trailing_blanks = 1;
        config.keywords_score = keywords_score;
        config.keywords_threshold = keywords_threshold;
        config.keywords_file = Some(paths.keywords_file.to_string_lossy().into_owned());

        let spotter = KeywordSpotter::create(&config).ok_or_else(|| {
            format!(
                "Failed to initialize Sherpa-ONNX KeywordSpotter from {}",
                paths.dir.display()
            )
        })?;
        let stream = spotter.create_stream();
        Ok(Self { spotter, stream })
    }

    pub fn from_paths_default(paths: &WakeWordModelPaths) -> Result<Self, String> {
        Self::from_paths(paths, 1.5, 0.25)
    }

    pub fn create_stream_with_keywords(&self, keywords: &str) -> OnlineStream {
        self.spotter.create_stream_with_keywords(keywords)
    }

    pub fn spotter(&self) -> &KeywordSpotter {
        &self.spotter
    }
}

impl WakeWordDetector for SherpaKwsDetector {
    fn accept_samples(&mut self, samples_16k: &[f32]) -> Option<String> {
        if samples_16k.is_empty() {
            return None;
        }

        self.stream.accept_waveform(16000, samples_16k);
        while self.spotter.is_ready(&self.stream) {
            self.spotter.decode(&self.stream);
        }

        if let Some(result) = self.spotter.get_result(&self.stream) {
            let keyword = result.keyword.trim().to_string();
            if !keyword.is_empty() {
                self.spotter.reset(&self.stream);
                return Some(keyword);
            }
        }

        None
    }

    fn reset(&mut self) {
        self.spotter.reset(&self.stream);
    }
}
