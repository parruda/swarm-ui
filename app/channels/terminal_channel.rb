# frozen_string_literal: true

# WebSocket channel for terminal I/O
class TerminalChannel < ApplicationCable::Channel
  def subscribed
    @session_id = params[:session_id]
    Rails.logger.info "Terminal channel subscribed for session: #{@session_id}"
    
    begin
      @terminal = ClaudeTerminalProxy.new(@session_id)
      @terminal.start
      Rails.logger.info "Terminal proxy started successfully"
    rescue => e
      Rails.logger.error "Failed to start terminal proxy: #{e.message}"
      reject
      return
    end

    stream_from "terminal_#{@session_id}"

    # Start reading output
    @reader_thread = Thread.new do
      Rails.logger.info "Terminal reader thread started"
      loop do
        output = @terminal.read
        if output
          Rails.logger.debug "Terminal output: #{output.length} bytes"
          ActionCable.server.broadcast("terminal_#{@session_id}", {
            type: "output",
            data: Base64.encode64(output)
          })
        end
        sleep 0.01
      rescue StandardError => e
        Rails.logger.error "Terminal reader error: #{e.message}"
        break
      end
    end
    
    # Send initial prompt to confirm connection
    ActionCable.server.broadcast("terminal_#{@session_id}", {
      type: "output",
      data: Base64.encode64("\r\nTerminal connected. Attaching to session...\r\n")
    })
  end

  def input(data)
    decoded = Base64.decode64(data["data"])
    @terminal.write(decoded)
  end

  def resize(data)
    # Handle terminal resize
    @terminal.resize(data["cols"], data["rows"])
  end

  def unsubscribed
    @reader_thread&.kill
    @terminal&.stop
  end
end