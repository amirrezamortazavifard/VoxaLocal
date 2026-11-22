use rubato::{FastFixedIn, PolynomialDegree, Resampler};

pub struct AudioResampler {
    resampler: Option<FastFixedIn<f32>>,
    source_rate: u32,
    target_rate: u32,
    input_buffer: Vec<f32>,
    chunk_size: usize,
}

impl AudioResampler {
    pub fn new(source_rate: u32, target_rate: u32) -> Result<Self, String> {
        if source_rate == target_rate {
            return Ok(Self {
                resampler: None,
                source_rate,
                target_rate,
                input_buffer: Vec::new(),
                chunk_size: 0,
            });
        }

        let chunk_size = 1024;
        let resample_ratio = target_rate as f64 / source_rate as f64;
        let resampler = FastFixedIn::<f32>::new(
            resample_ratio,
            1.0,
            PolynomialDegree::Septic,
            chunk_size,
            1,
        ).map_err(|e| format!("Failed to create Rubato resampler: {e}"))?;

        Ok(Self {
            resampler: Some(resampler),
            source_rate,
            target_rate,
            input_buffer: Vec::with_capacity(chunk_size * 2),
            chunk_size,
        })
    }

    pub fn process(&mut self, input: &[f32]) -> Result<Vec<f32>, String> {
        if self.source_rate == self.target_rate || self.resampler.is_none() {
            return Ok(input.to_vec());
        }

        let resampler = self.resampler.as_mut().unwrap();
        self.input_buffer.extend_from_slice(input);

        let mut output = Vec::new();

        while self.input_buffer.len() >= self.chunk_size {
            let chunk: Vec<f32> = self.input_buffer.drain(..self.chunk_size).collect();
            let wave_in = vec![chunk];
            let wave_out = resampler
                .process(&wave_in, None)
                .map_err(|e| format!("Resampling error: {e}"))?;

            if let Some(resampled_channel) = wave_out.into_iter().next() {
                output.extend(resampled_channel);
            }
        }

        Ok(output)
    }

    pub fn flush(&mut self) -> Result<Vec<f32>, String> {
        if self.input_buffer.is_empty() || self.resampler.is_none() {
            return Ok(Vec::new());
        }

        let resampler = self.resampler.as_mut().unwrap();
        // Pad remaining samples to chunk_size with zeros
        let remaining_len = self.input_buffer.len();
        self.input_buffer.resize(self.chunk_size, 0.0);
        let chunk: Vec<f32> = self.input_buffer.drain(..).collect();

        let wave_in = vec![chunk];
        let wave_out = resampler
            .process(&wave_in, None)
            .map_err(|e| format!("Resampling flush error: {e}"))?;

        let mut output = Vec::new();
        if let Some(resampled_channel) = wave_out.into_iter().next() {
            let valid_output_len = ((remaining_len as f64 * (self.target_rate as f64 / self.source_rate as f64)).round() as usize).min(resampled_channel.len());
            output.extend_from_slice(&resampled_channel[..valid_output_len]);
        }

        Ok(output)
    }
}
