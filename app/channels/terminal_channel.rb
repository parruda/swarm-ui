# frozen_string_literal: true

# WebSocket channel for terminal I/O
class TerminalChannel < ApplicationCable::Channel
  def subscribed
    @session_id = params[:session_id]
    @terminal = ClaudeTerminalProxy.new(@session_id)
    @terminal.start

    stream_from "terminal_#{@session_id}"

    # Start reading output
    @reader_thread = Thread.new do
      loop do
        output = @terminal.read
        if output
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