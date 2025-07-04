# frozen_string_literal: true

require_relative "tmux_manager"

# Service for streaming output from sessions (both interactive and non-interactive)
class OutputStreamer
  def initialize(session)
    @session = session
  end

  def stream_output(&block)
    case @session.mode
    when "interactive"
      # For interactive sessions, capture from tmux
      stream_from_tmux(&block)
    when "non-interactive"
      # For non-interactive, tail the output file
      stream_from_file(&block)
    end
  end

  private

  def stream_from_tmux(&block)
    # Capture current pane content using TmuxManager
    tmux = TmuxManager.new(@session.tmux_session)
    output = tmux.capture_pane
    output.each_line(&block)

    # For continuous streaming, would need to implement a loop with capture-pane
    # This is a simplified version - in production you'd want to use tmux's pipe-pane
  end

  def stream_from_file(&block)
    return unless @session.output_file && File.exist?(@session.output_file)

    File.open(@session.output_file, "r") do |file|
      # First, read existing content
      file.each_line(&block)

      # Continue tailing if still running
      if @session.status == "active"
        file.seek(0, IO::SEEK_END)
        loop do
          line = file.gets
          if line
            block.call(line)
          else
            sleep 0.1
            break unless session_still_active?
          end
        end
      end
    end
  end

  def session_still_active?
    @session.reload.status == "active"
  end
end