use voxlocal_lib::shortcuts::state_machine::{PttMode, PttState, PttStateMachine};

#[test]
fn test_push_to_talk_lifecycle() {
    let mut sm = PttStateMachine::new(PttMode::PushToTalk);
    assert_eq!(sm.state(), PttState::Idle);

    // Initial press triggers start
    let should_start = sm.on_press();
    assert!(should_start);
    assert_eq!(sm.state(), PttState::Starting);

    // Repeated OS keypresses (key repeat) while starting must be ignored
    let duplicate_press = sm.on_press();
    assert!(!duplicate_press, "Key repeat during starting must not trigger new sessions");
    assert_eq!(sm.state(), PttState::Starting);

    // Startup finishes
    let stop_immediate = sm.on_started();
    assert!(!stop_immediate);
    assert_eq!(sm.state(), PttState::Recording);

    // Key repeat while recording must be ignored
    assert!(!sm.on_press());
    assert_eq!(sm.state(), PttState::Recording);

    // Release triggers stop
    let should_stop = sm.on_release();
    assert!(should_stop);
    assert_eq!(sm.state(), PttState::Finalizing);

    // Finalized
    sm.on_finalized();
    assert_eq!(sm.state(), PttState::Result);

    // Reset back to idle
    sm.reset_to_idle();
    assert_eq!(sm.state(), PttState::Idle);
}

#[test]
fn test_ptt_released_during_startup_race() {
    let mut sm = PttStateMachine::new(PttMode::PushToTalk);

    // Press starts
    assert!(sm.on_press());
    assert_eq!(sm.state(), PttState::Starting);

    // User releases key BEFORE startup has completed
    let should_stop_now = sm.on_release();
    assert!(!should_stop_now, "Cannot stop before worker has started");

    // Once startup completes, on_started returns true indicating an immediate stop is required
    let immediate_stop = sm.on_started();
    assert!(immediate_stop, "Pending release must immediately trigger stop on start");
    assert_eq!(sm.state(), PttState::Finalizing);

    sm.on_finalized();
    assert_eq!(sm.state(), PttState::Result);
}

#[test]
fn test_toggle_mode_lifecycle() {
    let mut sm = PttStateMachine::new(PttMode::Toggle);
    assert_eq!(sm.state(), PttState::Idle);

    // 1st Press: starts recording
    assert!(sm.on_press());
    assert_eq!(sm.state(), PttState::Starting);

    // Key release in Toggle mode does nothing
    assert!(!sm.on_release());

    // Started
    assert!(!sm.on_started());
    assert_eq!(sm.state(), PttState::Recording);

    // 2nd Press: stops recording
    let should_start = sm.on_press();
    assert!(!should_start);
    assert_eq!(sm.state(), PttState::Finalizing);

    sm.on_finalized();
    assert_eq!(sm.state(), PttState::Result);
}
