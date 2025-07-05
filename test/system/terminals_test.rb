require "application_system_test_case"

class TerminalsTest < ApplicationSystemTestCase
  setup do
    # Create an interactive session with tmux
    @session = create(:session, 
      mode: 'interactive',
      tmux_session: 'claude-swarm-test-session',
      status: 'active'
    )
    
    # Mock tmux session exists
    system_mock = mock()
    system_mock.stubs(:call).with("tmux has-session -t claude-swarm-test-session 2>/dev/null").returns(true)
    Kernel.stubs(:system).returns(system_mock)
  end

  test "accessing terminal for interactive session" do
    # Mock the terminal WebSocket connection
    Session.any_instance.stubs(:active?).returns(true)
    
    visit session_path(@session.session_id)
    
    # Should see terminal access button for interactive session
    assert_text @session.session_id
    assert_selector "a", text: "Open Terminal"
    
    click_link "Open Terminal"
    
    # Should be on terminal page
    assert_current_path session_terminal_path(@session.session_id)
    
    # Terminal container should be present
    assert_selector "[data-controller='terminal']"
    assert_selector "#terminal-container"
    
    # Should have terminal configuration data
    terminal_element = find("[data-controller='terminal']")
    assert_equal @session.session_id, terminal_element["data-terminal-session-id-value"]
    assert_equal @session.tmux_session, terminal_element["data-terminal-tmux-session-value"]
  end

  test "terminal not available for non-interactive session" do
    @non_interactive_session = create(:session, :non_interactive)
    
    visit session_path(@non_interactive_session.session_id)
    
    # Should not see terminal access for non-interactive session
    assert_no_selector "a", text: "Open Terminal"
    
    # Directly accessing terminal URL should redirect
    visit session_terminal_path(@non_interactive_session.session_id)
    
    assert_current_path session_path(@non_interactive_session.session_id)
    assert_text "Terminal is only available for interactive sessions"
  end

  test "terminal handles tmux session not found" do
    # Mock tmux session doesn't exist
    system_mock = mock()
    system_mock.stubs(:call).with("tmux has-session -t claude-swarm-test-session 2>/dev/null").returns(false)
    Kernel.stubs(:system).returns(system_mock)
    
    visit session_terminal_path(@session.session_id)
    
    # Should redirect back to session page with error
    assert_current_path session_path(@session.session_id)
    assert_text "Tmux session no longer exists"
  end

  test "terminal interface elements" do
    Session.any_instance.stubs(:active?).returns(true)
    
    visit session_terminal_path(@session.session_id)
    
    # Check for terminal UI elements
    assert_selector "#terminal-container"
    
    # Back to session link
    assert_selector "a", text: "← Back to Session"
    
    # Session info displayed
    assert_text "Session: #{@session.session_id}"
    assert_text "Tmux: #{@session.tmux_session}"
    
    # Terminal controls (if implemented)
    # assert_selector "button", text: "Clear"
    # assert_selector "button", text: "Reconnect"
  end

  test "terminal page shows connection status" do
    Session.any_instance.stubs(:active?).returns(true)
    
    visit session_terminal_path(@session.session_id)
    
    # Should show connection status
    within "[data-controller='terminal']" do
      # Initial state might show connecting
      assert_selector "[data-terminal-target='status']"
    end
  end
end