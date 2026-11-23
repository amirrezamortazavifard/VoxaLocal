use std::sync::Arc;
use std::thread::{self, JoinHandle};
use crossbeam_channel::{Receiver, Sender};
use tauri::{AppHandle, Emitter};

use crate::asr::events::{
    CommitEventPayload, EouEventPayload, LanguageEventPayload, PartialEventPayload,
    StatusEventPayload, WordItem,
};

pub enum SessionCommand {
    Audio(Vec<f32>),
    Finish,
    Cancel,
}

pub struct ActiveSession {
    pub session_id: String,
    pub origin: crate::asr::SessionOrigin,
    pub command_sender: Sender<SessionCommand>,
    pub worker_handle: Option<JoinHandle<()>>,
}

pub fn spawn_session_worker(
    app: AppHandle,
    session_id: String,
    models: Arc<tinyasr::Models>,
    language_mode: String,
    beam_width: usize,
    command_receiver: Receiver<SessionCommand>,
) -> JoinHandle<()> {
    thread::Builder::new()
        .name(format!("voxlocal-asr-{session_id}"))
        .spawn(move || {
            log::info!("[ASR Worker {session_id}] Started recognition session with langs: {language_mode}, beam: {beam_width}");

            let langs_vec: Vec<&str> = match language_mode.as_str() {
                "fa" => vec!["fa"],
                "en" => vec!["en"],
                _ => vec!["fa", "en"],
            };

            let options = tinyasr::Options {
                start_lang: if language_mode == "en" { "en".to_string() } else { "fa".to_string() },
                beam: beam_width.max(1),
                ..Default::default()
            };

            let mut session = tinyasr::Session::new(&*models, &langs_vec, options);

            let _ = app.emit("asr://status", StatusEventPayload {
                session_id: Some(session_id.clone()),
                status: "recording".to_string(),
                message: None,
            });

            let mut is_cancelled = false;
            let mut last_committed_end: f32 = -1.0;

            while let Ok(cmd) = command_receiver.recv() {
                match cmd {
                    SessionCommand::Audio(pcm_chunk) => {
                        if is_cancelled {
                            continue;
                        }
                        if pcm_chunk.is_empty() {
                            continue;
                        }
                        let events = session.push(&pcm_chunk);
                        dispatch_events(&app, &session_id, events, &mut last_committed_end);
                    }
                    SessionCommand::Finish => {
                        log::info!("[ASR Worker {session_id}] Finish command received, finalizing remaining audio");
                        let _ = app.emit("asr://status", StatusEventPayload {
                            session_id: Some(session_id.clone()),
                            status: "processing".to_string(),
                            message: Some("Finalizing transcript...".to_string()),
                        });

                        let events = session.finish();
                        dispatch_events(&app, &session_id, events, &mut last_committed_end);
                        break;
                    }
                    SessionCommand::Cancel => {
                        log::info!("[ASR Worker {session_id}] Session cancelled by user");
                        is_cancelled = true;
                        break;
                    }
                }
            }

            let _ = app.emit("asr://status", StatusEventPayload {
                session_id: Some(session_id.clone()),
                status: if is_cancelled { "cancelled".to_string() } else { "idle".to_string() },
                message: None,
            });

            log::info!("[ASR Worker {session_id}] Worker thread finished cleanly.");
        })
        .expect("Failed to spawn ASR worker thread")
}

fn dispatch_events(
    app: &AppHandle,
    session_id: &str,
    events: Vec<tinyasr::Event>,
    last_committed_end: &mut f32,
) {
    for event in events {
        match event {
            tinyasr::Event::Partial { open, tail } => {
                let _ = app.emit("asr://partial", PartialEventPayload {
                    session_id: session_id.to_string(),
                    open: open.into_iter().map(WordItem::from).collect(),
                    tail: tail.into_iter().map(WordItem::from).collect(),
                });
            }
            tinyasr::Event::Commit(words) => {
                let valid_words: Vec<WordItem> = words
                    .into_iter()
                    .map(WordItem::from)
                    .filter(|w| w.start >= *last_committed_end - 0.05)
                    .collect();

                if !valid_words.is_empty() {
                    if let Some(last) = valid_words.last() {
                        *last_committed_end = last.end;
                    }
                    log::info!(
                        "[ASR Worker {session_id}] Emitting Commit: {} words (range: {:.2}s - {:.2}s)",
                        valid_words.len(),
                        valid_words.first().map(|w| w.start).unwrap_or(0.0),
                        *last_committed_end,
                    );
                    let _ = app.emit("asr://commit", CommitEventPayload {
                        session_id: session_id.to_string(),
                        words: valid_words,
                    });
                }
            }
            tinyasr::Event::Language(lang) => {
                let _ = app.emit("asr://language", LanguageEventPayload {
                    session_id: session_id.to_string(),
                    lang,
                });
            }
            tinyasr::Event::Eou { at, p } => {
                let _ = app.emit("asr://eou", EouEventPayload {
                    session_id: session_id.to_string(),
                    at,
                    p,
                });
            }
        }
    }
}
