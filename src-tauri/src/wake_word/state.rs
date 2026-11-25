use serde::{Deserialize, Serialize};

use super::settings::VoiceActivationMode;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VoiceActivationState {
    Disabled,
    Starting,
    Listening,
    Triggered,
    PausedForRecording,
    Stopping,
    Error,
}

impl VoiceActivationState {
    pub fn as_u8(self) -> u8 {
        match self {
            Self::Disabled => 0,
            Self::Starting => 1,
            Self::Listening => 2,
            Self::Triggered => 3,
            Self::PausedForRecording => 4,
            Self::Stopping => 5,
            Self::Error => 6,
        }
    }

    pub fn from_u8(val: u8) -> Self {
        match val {
            0 => Self::Disabled,
            1 => Self::Starting,
            2 => Self::Listening,
            3 => Self::Triggered,
            4 => Self::PausedForRecording,
            5 => Self::Stopping,
            6 => Self::Error,
            _ => Self::Disabled,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceActivationStatusPayload {
    pub enabled: bool,
    pub state: VoiceActivationState,
    pub wake_phrase: String,
    pub mode: VoiceActivationMode,
    pub error_message: Option<String>,
    pub model_ready: bool,
}
