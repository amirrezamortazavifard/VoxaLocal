use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub channels: u16,
    pub default_sample_rate: u32,
}

pub fn list_input_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_device_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate audio input devices: {e}"))?;

    let mut result = Vec::new();

    for device in devices {
        if let Ok(name) = device.name() {
            let is_default = default_device_name.as_ref() == Some(&name);

            let (channels, default_sample_rate) = match device.default_input_config() {
                Ok(cfg) => (cfg.channels(), cfg.sample_rate().0),
                Err(_) => (1, 48000),
            };

            result.push(AudioDeviceInfo {
                id: name.clone(),
                name,
                is_default,
                channels,
                default_sample_rate,
            });
        }
    }

    Ok(result)
}

pub fn get_input_device(name: Option<&str>) -> Result<(cpal::Device, cpal::SupportedStreamConfig), String> {
    let host = cpal::default_host();

    let device = match name {
        Some(target_name) => {
            let mut found = None;
            let devices = host
                .input_devices()
                .map_err(|e| format!("Failed to list devices: {e}"))?;
            for d in devices {
                if let Ok(d_name) = d.name() {
                    if d_name == target_name {
                        found = Some(d);
                        break;
                    }
                }
            }
            found.ok_or_else(|| format!("Specified audio device '{target_name}' not found"))?
        }
        None => host
            .default_input_device()
            .ok_or_else(|| "No default audio input device found".to_string())?,
    };

    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config for device: {e}"))?;

    Ok((device, config))
}
