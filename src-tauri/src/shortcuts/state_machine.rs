use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PttMode {
    PushToTalk,
    Toggle,
}

impl Default for PttMode {
    fn default() -> Self {
        PttMode::Toggle
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PttState {
    Idle,
    Starting,
    Recording,
    Finalizing,
    Result,
    Cancelled,
    Error,
}

pub struct PttStateMachine {
    current_state: PttState,
    mode: PttMode,
    stop_pending: bool,
}

impl PttStateMachine {
    pub fn new(mode: PttMode) -> Self {
        Self {
            current_state: PttState::Idle,
            mode,
            stop_pending: false,
        }
    }

    pub fn state(&self) -> PttState {
        self.current_state
    }

    pub fn mode(&self) -> PttMode {
        self.mode
    }

    pub fn set_mode(&mut self, mode: PttMode) {
        self.mode = mode;
    }

    /// Handles shortcut pressed event.
    /// Returns true if an ASR recording session should be initiated.
    pub fn on_press(&mut self) -> bool {
        match self.mode {
            PttMode::PushToTalk => {
                match self.current_state {
                    PttState::Idle | PttState::Result | PttState::Cancelled | PttState::Error => {
                        self.current_state = PttState::Starting;
                        self.stop_pending = false;
                        true
                    }
                    PttState::Starting | PttState::Recording | PttState::Finalizing => {
                        // Key repeat or already active; ignore
                        false
                    }
                }
            }
            PttMode::Toggle => {
                match self.current_state {
                    PttState::Idle | PttState::Result | PttState::Cancelled | PttState::Error => {
                        self.current_state = PttState::Starting;
                        self.stop_pending = false;
                        true
                    }
                    PttState::Recording => {
                        self.current_state = PttState::Finalizing;
                        false // Handled via toggle stop
                    }
                    PttState::Starting => {
                        self.stop_pending = true;
                        false
                    }
                    PttState::Finalizing => false,
                }
            }
        }
    }

    /// Handles shortcut released event.
    /// Returns true if an active ASR session should be stopped now.
    pub fn on_release(&mut self) -> bool {
        match self.mode {
            PttMode::PushToTalk => {
                match self.current_state {
                    PttState::Starting => {
                        // Released while startup was still in progress; flag for immediate stop on start
                        self.stop_pending = true;
                        false
                    }
                    PttState::Recording => {
                        self.current_state = PttState::Finalizing;
                        self.stop_pending = false;
                        true
                    }
                    _ => false,
                }
            }
            PttMode::Toggle => {
                // Key release does not affect Toggle mode
                false
            }
        }
    }

    /// Called when the recording session has successfully started.
    /// Returns true if stop was already requested while starting.
    pub fn on_started(&mut self) -> bool {
        if self.stop_pending {
            self.current_state = PttState::Finalizing;
            self.stop_pending = false;
            true
        } else {
            self.current_state = PttState::Recording;
            false
        }
    }

    /// Called when the session has finalized and final transcript is ready.
    pub fn on_finalized(&mut self) {
        self.current_state = PttState::Result;
        self.stop_pending = false;
    }

    /// Resets state back to Idle (e.g. when dismissed or cancelled).
    pub fn reset_to_idle(&mut self) {
        self.current_state = PttState::Idle;
        self.stop_pending = false;
    }

    pub fn on_error(&mut self) {
        self.current_state = PttState::Error;
        self.stop_pending = false;
    }
}
