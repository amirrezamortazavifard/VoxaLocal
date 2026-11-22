use std::sync::atomic::{AtomicU64, Ordering};

pub struct AudioBufferStats {
    pub total_samples: AtomicU64,
    pub dropped_samples: AtomicU64,
}

impl AudioBufferStats {
    pub fn new() -> Self {
        Self {
            total_samples: AtomicU64::new(0),
            dropped_samples: AtomicU64::new(0),
        }
    }

    pub fn record_captured(&self, count: usize) {
        self.total_samples.fetch_add(count as u64, Ordering::Relaxed);
    }

    pub fn record_dropped(&self, count: usize) {
        self.dropped_samples.fetch_add(count as u64, Ordering::Relaxed);
    }

    pub fn dropped_count(&self) -> u64 {
        self.dropped_samples.load(Ordering::Relaxed)
    }

    pub fn total_count(&self) -> u64 {
        self.total_samples.load(Ordering::Relaxed)
    }
}

pub fn calculate_rms_and_peak(samples: &[f32]) -> (f32, f32, f32) {
    if samples.is_empty() {
        return (0.0, 0.0, -96.0);
    }

    let mut sum_sq = 0.0f32;
    let mut peak = 0.0f32;

    for &s in samples {
        let abs_val = s.abs();
        if abs_val > peak {
            peak = abs_val;
        }
        sum_sq += s * s;
    }

    let rms = (sum_sq / samples.len() as f32).sqrt();
    let db = if rms > 1e-5 {
        20.0 * rms.log10()
    } else {
        -96.0
    };

    (rms, peak, db)
}
