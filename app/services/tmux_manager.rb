# frozen_string_literal: true

require "pty"

# Service for managing tmux sessions
class TmuxManager
  def initialize(session_name)
    @session_name = session_name
  end

  # Create read-only attachment for monitoring
  def create_readonly_attachment
    PTY.spawn("tmux", "attach-session", "-rt", @session_name)
  end

  # Get session info
  def session_info
    format_string = '#{session_name}: #{session_created} #{session_attached}'
    output = `tmux list-sessions -F '#{format_string}' 2>/dev/null`
    output.lines.find { |line| line.start_with?(@session_name) }
  end

  # Capture current pane content
  def capture_pane(lines = 1000)
    `tmux capture-pane -t #{@session_name} -p -S -#{lines}`
  end

  # Send keys programmatically (for automation)
  def send_keys(text)
    system("tmux", "send-keys", "-t", @session_name, text)
  end

  # List all tmux sessions (for session discovery)
  def self.list_claude_sessions
    output = `tmux list-sessions -F '#S' 2>/dev/null` # #S is session name format
    output.lines.map(&:strip).select { |name| name.start_with?("claude-swarm-") }
  end
end