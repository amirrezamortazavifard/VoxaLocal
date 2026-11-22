use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct WordItem {
    pub text: String,
    pub start: f32,
    pub end: f32,
    pub join: bool,
}

impl From<tinyasr::Word> for WordItem {
    fn from(w: tinyasr::Word) -> Self {
        Self {
            text: w.text,
            start: w.start,
            end: w.end,
            join: w.join,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialEventPayload {
    pub session_id: String,
    pub open: Vec<WordItem>,
    pub tail: Vec<WordItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitEventPayload {
    pub session_id: String,
    pub words: Vec<WordItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageEventPayload {
    pub session_id: String,
    pub lang: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EouEventPayload {
    pub session_id: String,
    pub at: f32,
    pub p: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEventPayload {
    pub session_id: Option<String>,
    pub status: String, // "idle" | "recording" | "processing" | "error"
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevelPayload {
    pub rms: f32,
    pub peak: f32,
    pub db: f32,
    pub is_speech: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrErrorPayload {
    pub session_id: Option<String>,
    pub code: String,
    pub message: String,
}
