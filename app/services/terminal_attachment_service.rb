# frozen_string_literal: true

require "pty"

# Service for attaching to terminal sessions via tmux
class TerminalAttachmentService
  def initialize(session_id)
    @session = Session.find_by!(session_id: session_id)
  end

  def create_attachment_pty
    raise "Cannot attach to non-interactive session" if @session.mode == "non-interactive"

    # Attach to tmux session
    PTY.spawn("tmux", "attach-session", "-t", @session.tmux_session)
  end

  def session_exists?
    case @session.mode
    when "interactive"
      system("tmux has-session -t #{@session.tmux_session} 2>/dev/null")
    when "non-interactive"
      @session.pid && Process.kill(0, @session.pid)
    end
  rescue Errno::ESRCH, Errno::EPERM
    false
  end

  def kill_session
    case @session.mode
    when "interactive"
      system("tmux kill-session -t #{@session.tmux_session}")
    when "non-interactive"
      Process.kill("TERM", @session.pid) if @session.pid
    end
  rescue Errno::ESRCH, Errno::EPERM
    nil
  end
end