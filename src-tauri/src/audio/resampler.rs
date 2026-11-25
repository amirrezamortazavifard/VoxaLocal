/// Ultra-low-latency real-time streaming resampler matching the TinyASR native web worklet:
/// Linear interpolation over a 3-tap moving average anti-aliasing filter, emitting
/// in exact 640-sample (40 ms) frames with zero block latency.
/// Uses `f64` sample-position accumulators so multi-hour audio files (> 2^24 samples)
/// never hit `f32` ULP rounding stagnation (`t + r == t`).
pub struct AudioResampler {
    source_rate: u32,
    target_rate: u32,
    r: f64,
    t: f64,
    p: f32,
    q: f32,
    out_buffer: Vec<f32>,
}

impl AudioResampler {
    pub fn new(source_rate: u32, target_rate: u32) -> Result<Self, String> {
        if source_rate == 0 || target_rate == 0 {
            return Err("Sample rate must be greater than 0".to_string());
        }

        let r = source_rate as f64 / target_rate as f64;
        Ok(Self {
            source_rate,
            target_rate,
            r,
            t: 0.0,
            p: 0.0,
            q: 0.0,
            out_buffer: Vec::with_capacity(1280),
        })
    }

    pub fn process(&mut self, input: &[f32]) -> Result<Vec<f32>, String> {
        if input.is_empty() {
            return Ok(Vec::new());
        }

        if self.source_rate == self.target_rate {
            self.out_buffer.extend_from_slice(input);
            if self.out_buffer.len() >= 640 {
                let n_frames = (self.out_buffer.len() / 640) * 640;
                let chunk: Vec<f32> = self.out_buffer.drain(..n_frames).collect();
                return Ok(chunk);
            }
            return Ok(Vec::new());
        }

        let r = self.r;
        let n = input.len();
        let mut x = Vec::with_capacity(n);

        // 3-tap moving average anti-aliasing filter when downsampling (r >= 2.0)
        if r >= 2.0 {
            for j in 0..n {
                let a = if j > 0 { input[j - 1] } else { self.p };
                let b = input[j];
                let d = if j + 1 < n { input[j + 1] } else { input[j] };
                x.push((a + b + d) / 3.0);
            }
        } else {
            x.extend_from_slice(input);
        }

        let mut t = self.t;
        let limit = (n as f64) - 1.0;
        while t < limit {
            let k = t.floor() as isize;
            let f = (t - (k as f64)) as f32;
            let a = if k < 0 { self.q } else { x[k as usize] };
            let b = if (k + 1) < n as isize {
                x[(k + 1) as usize]
            } else {
                x[k as usize]
            };
            self.out_buffer.push(a + (b - a) * f);
            t += r;
        }

        self.t = t - (n as f64);
        self.p = input[n - 1];
        self.q = x[n - 1];

        // Emit chunks of 640 samples (40ms) immediately to feed tinyasr frame-by-frame
        if self.out_buffer.len() >= 640 {
            let n_frames = (self.out_buffer.len() / 640) * 640;
            let chunk: Vec<f32> = self.out_buffer.drain(..n_frames).collect();
            Ok(chunk)
        } else {
            Ok(Vec::new())
        }
    }

    pub fn flush(&mut self) -> Result<Vec<f32>, String> {
        let remaining = std::mem::take(&mut self.out_buffer);
        self.t = 0.0;
        self.p = 0.0;
        self.q = 0.0;
        Ok(remaining)
    }
}
