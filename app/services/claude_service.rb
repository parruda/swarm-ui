# frozen_string_literal: true

require "claude_sdk"

class ClaudeService
  class ClaudeError < StandardError; end

  def initialize(working_directory: nil)
    @working_directory = working_directory
  end

  def generate_commit_message(changes)
    options = ClaudeSDK::ClaudeCodeOptions.new(
      cwd: @working_directory
    )
    
    response_text = ""
    
    begin
      ClaudeSDK.query(
        "Generate a concise git commit message for the following changes:\n\n#{changes}",
        options: options
      ) do |message|
        case message
        when ::ClaudeSDK::Messages::Assistant
          message.content.each do |block|
            if block.is_a?(::ClaudeSDK::ContentBlock::Text)
              response_text += block.text
            end
          end
        when ::ClaudeSDK::Messages::System
          # System messages can be informational, log them if needed
          Rails.logger.debug("[Claude] System message: #{message.subtype}")
        when ::ClaudeSDK::Messages::Result
          # Result message indicates completion
          Rails.logger.debug("[Claude] Query completed in #{message.duration_ms}ms")
        end
      end
      
      response_text.strip
    rescue ClaudeSDK::CLINotFoundError => e
      raise ClaudeError, "Claude CLI not found: #{e.message}"
    rescue ClaudeSDK::CLIConnectionError => e
      raise ClaudeError, "Failed to connect to Claude CLI: #{e.message}"
    rescue ClaudeSDK::ProcessError => e
      raise ClaudeError, "Claude process error: #{e.message}"
    end
  end
end