# frozen_string_literal: true

require "pty"

# Manages PTY connections for terminal sessions
class ClaudeTerminalProxy
  def initialize(session_id)
    @session = Session.find_by!(session_id: session_id)
    @session_path = @session.session_path
  end

  def start
    # Create a new PTY for the web terminal
    PTY.spawn(build_command) do |stdout, stdin, pid|
      @pty_out = stdout
      @pty_in = stdin
      @pty_pid = pid

      # Set up non-blocking I/O
      @pty_out.nonblock = true
      @pty_in.nonblock = true
    end
  end

  def write(data)
    @pty_in.write(data) if @pty_in
  rescue Errno::EIO
    # Terminal has been closed
    nil
  end

  def read
    @pty_out.read_nonblock(1024) if @pty_out
  rescue IO::WaitReadable, Errno::EIO
    nil
  end

  def resize(cols, rows)
    return unless @pty_pid

    # Send terminal resize signal
    system("stty -F #{@pty_out.path} rows #{rows} cols #{cols}") if @pty_out&.path
  rescue StandardError => e
    Rails.logger.error "Failed to resize terminal: #{e.message}"
  end

  def stop
    Process.kill("TERM", @pty_pid) if @pty_pid
    @pty_in&.close
    @pty_out&.close
  rescue Errno::ESRCH, Errno::EIO
    # Process already gone or IO already closed
  ensure
    @pty_pid = nil
    @pty_in = nil
    @pty_out = nil
  end

  private

  def build_command
    # Always attach to the tmux session we created at launch
    if @session.tmux_session.present?
      "tmux attach-session -t #{@session.tmux_session}"
    else
      "tmux attach-session -t claude-swarm-#{@session.session_id}"
    end
  end
end