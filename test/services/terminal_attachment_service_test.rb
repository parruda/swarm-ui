# frozen_string_literal: true

require "test_helper"

class TerminalAttachmentServiceTest < ActiveSupport::TestCase
  setup do
    @interactive_session = create(:session)
    @non_interactive_session = create(:session, :non_interactive)
  end

  test "create_attachment_pty works for interactive session" do
    service = TerminalAttachmentService.new(@interactive_session.session_id)
    
    # Mock PTY.spawn
    mock_stdout = mock("stdout")
    mock_stdin = mock("stdin")
    mock_pid = 12345
    
    PTY.expects(:spawn).with("tmux", "attach-session", "-t", @interactive_session.tmux_session)
       .returns([mock_stdout, mock_stdin, mock_pid])

    result = service.create_attachment_pty

    assert_equal [mock_stdout, mock_stdin, mock_pid], result
  end

  test "create_attachment_pty raises error for non-interactive session" do
    service = TerminalAttachmentService.new(@non_interactive_session.session_id)

    assert_raises(RuntimeError, "Cannot attach to non-interactive session") do
      service.create_attachment_pty
    end
  end

  test "session_exists? returns true for active interactive session" do
    service = TerminalAttachmentService.new(@interactive_session.session_id)
    
    # Mock successful tmux check
    service.expects(:system).with("tmux has-session -t #{@interactive_session.tmux_session} 2>/dev/null")
           .returns(true)

    result = service.session_exists?

    assert result
  end

  test "session_exists? returns false for missing interactive session" do
    service = TerminalAttachmentService.new(@interactive_session.session_id)
    
    # Mock failed tmux check
    service.expects(:system).with("tmux has-session -t #{@interactive_session.tmux_session} 2>/dev/null")
           .returns(false)

    result = service.session_exists?

    assert_not result
  end

  test "session_exists? checks process for non-interactive session" do
    service = TerminalAttachmentService.new(@non_interactive_session.session_id)
    
    # Mock successful process check
    Process.expects(:kill).with(0, @non_interactive_session.pid).returns(1)

    result = service.session_exists?

    assert result
  end

  test "session_exists? returns false when non-interactive process is dead" do
    service = TerminalAttachmentService.new(@non_interactive_session.session_id)
    
    # Mock process not found
    Process.expects(:kill).with(0, @non_interactive_session.pid).raises(Errno::ESRCH)

    result = service.session_exists?

    assert_not result
  end

  test "session_exists? returns false when non-interactive session has no pid" do
    @non_interactive_session = create(:session, :non_interactive, pid: nil)
    service = TerminalAttachmentService.new(@non_interactive_session.session_id)

    result = service.session_exists?

    assert_not result
  end

  test "kill_session kills tmux session for interactive mode" do
    service = TerminalAttachmentService.new(@interactive_session.session_id)
    
    # Mock tmux kill command
    service.expects(:system).with("tmux kill-session -t #{@interactive_session.tmux_session}")
           .returns(true)

    service.kill_session
  end

  test "kill_session sends TERM signal for non-interactive mode" do
    service = TerminalAttachmentService.new(@non_interactive_session.session_id)
    
    # Mock process kill
    Process.expects(:kill).with("TERM", @non_interactive_session.pid).returns(1)

    service.kill_session
  end

  test "kill_session handles missing process gracefully" do
    service = TerminalAttachmentService.new(@non_interactive_session.session_id)
    
    # Mock process not found
    Process.expects(:kill).with("TERM", @non_interactive_session.pid).raises(Errno::ESRCH)

    # Should not raise error
    assert_nothing_raised do
      service.kill_session
    end
  end

  test "kill_session does nothing when non-interactive session has no pid" do
    @non_interactive_session = create(:session, :non_interactive, pid: nil)
    service = TerminalAttachmentService.new(@non_interactive_session.session_id)
    
    # Should not attempt to kill
    Process.expects(:kill).never

    service.kill_session
  end

  test "handles permission errors gracefully" do
    @non_interactive_session = create(:session, :non_interactive, pid: 1) # System process
    service = TerminalAttachmentService.new(@non_interactive_session.session_id)
    
    # Mock permission denied
    Process.expects(:kill).with(0, @non_interactive_session.pid).raises(Errno::EPERM)

    result = service.session_exists?

    assert_not result
  end
end