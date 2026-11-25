use serde::{Deserialize, Serialize};

pub const DEFAULT_WAKE_PHRASE_ID: &str = "hey_voxa";
pub const DISPLAY_WAKE_PHRASE: &str = "Hey Voxa";
pub const VOICE_ACTIVATION_SETTINGS_KEY: &str = "voice_activation_settings";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VoiceActivationMode {
    #[serde(rename = "wake_only")]
    WakeOnly,
}

impl Default for VoiceActivationMode {
    fn default() -> Self {
        Self::WakeOnly
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceActivationSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_wake_phrase")]
    pub wake_phrase: String,
    #[serde(default)]
    pub mode: VoiceActivationMode,
}

fn default_wake_phrase() -> String {
    DEFAULT_WAKE_PHRASE_ID.to_string()
}

impl Default for VoiceActivationSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            wake_phrase: default_wake_phrase(),
            mode: VoiceActivationMode::WakeOnly,
        }
    }
}

impl VoiceActivationSettings {
    /// Parses settings from persisted storage, falling back gracefully on corrupt JSON
    /// or unsupported fields while keeping `enabled = false` safe defaults on total failure.
    pub fn from_persisted_json(raw: &str) -> Self {
        match serde_json::from_str::<VoiceActivationSettings>(raw) {
            Ok(parsed) => parsed.sanitized(),
            Err(err) => {
                log::warn!(
                    "Corrupt voice activation settings in database ({err}); reverting to safe defaults."
                );
                Self::default()
            }
        }
    }

    /// Validates an explicit settings update from the frontend UI/IPC.
    pub fn validate(&self) -> Result<Self, String> {
        if self.wake_phrase != DEFAULT_WAKE_PHRASE_ID {
            return Err(format!(
                "Unsupported wake phrase '{}'. Only '{}' ('{}') is supported.",
                self.wake_phrase, DEFAULT_WAKE_PHRASE_ID, DISPLAY_WAKE_PHRASE
            ));
        }
        Ok(Self {
            enabled: self.enabled,
            wake_phrase: DEFAULT_WAKE_PHRASE_ID.to_string(),
            mode: VoiceActivationMode::WakeOnly,
        })
    }

    /// Coerces unknown values to the safe single-phrase `wake_only` configuration.
    pub fn sanitized(mut self) -> Self {
        if self.wake_phrase != DEFAULT_WAKE_PHRASE_ID {
            log::warn!(
                "Unsupported persisted wake phrase '{}'; resetting to '{}'.",
                self.wake_phrase,
                DEFAULT_WAKE_PHRASE_ID
            );
            self.wake_phrase = default_wake_phrase();
        }
        self.mode = VoiceActivationMode::WakeOnly;
        self
    }
}
