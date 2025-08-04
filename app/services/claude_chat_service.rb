# frozen_string_literal: true

require "claude_sdk"

class ClaudeChatService
  def initialize(project:, file_path:, session_id: nil)
    @project = project
    @file_path = file_path
    @session_id = session_id # This is the Claude session ID from previous message
  end

  def chat(prompt, &block)
    # Ensure file exists
    unless File.exist?(@file_path)
      yield({ type: "error", content: "File does not exist: #{@file_path}" })
      return
    end

    begin
      # Configure options for Claude SDK
      options = ClaudeSDK::ClaudeCodeOptions.new(
        cwd: @project.path,
        system_prompt: build_system_prompt,
        allowed_tools: ["Read", "Write", "Edit", "MultiEdit", "Bash", "LS", "Grep"],
        permission_mode: :accept_edits,
        model: "opus", # Use Opus model
      )

      # If we have a session_id from a previous message, use resume to continue the conversation
      if @session_id.present?
        options.resume = @session_id
        Rails.logger.info("[ClaudeChatService] Resuming session: #{@session_id}")
      else
        Rails.logger.info("[ClaudeChatService] Starting new conversation")
      end

      # Track state
      accumulated_text = ""
      pending_tools = {}
      actual_session_id = nil

      # Stream the response using the SDK
      ClaudeSDK.query(prompt, options: options) do |message|
        case message
        when ClaudeSDK::Messages::User
          # User message echo (usually the prompt)
          Rails.logger.debug("[ClaudeChatService] User message: #{message.content}")

        when ClaudeSDK::Messages::Assistant
          # Assistant response with content blocks
          message.content.each do |content_block|
            case content_block
            when ClaudeSDK::ContentBlock::Text
              # Stream text content
              text = content_block.text
              accumulated_text += text
              yield({ type: "text", content: text })

            when ClaudeSDK::ContentBlock::ToolUse
              handle_tool_use(content_block, pending_tools, &block)

            when ClaudeSDK::ContentBlock::ToolResult
              # Tool execution result
              tool_info = pending_tools[content_block.tool_use_id]

              yield({
                type: "tool_result",
                tool_use_id: content_block.tool_use_id,
                tool_name: tool_info&.dig(:name),
                content: content_block.content,
                is_error: content_block.is_error,
              })

              # Remove from pending
              pending_tools.delete(content_block.tool_use_id)

              if content_block.is_error
                Rails.logger.error("[ClaudeChatService] Tool error: #{content_block.content}")
              end
            end
          end

        when ClaudeSDK::Messages::System
          # System messages (usage, thinking, etc)
          Rails.logger.debug("[ClaudeChatService] System message: #{message.subtype}")

          case message.subtype
          when "usage"
            yield({
              type: "usage",
              data: message.data,
            })
          when "thinking"
            # Only show thinking in development
            if Rails.env.development?
              yield({
                type: "thinking",
                content: message.data["content"],
              })
            end
          end

        when ClaudeSDK::Messages::Result
          # Final result with session info - this means Claude is DONE
          actual_session_id = message.session_id
          Rails.logger.info("[ClaudeChatService] Session complete: #{message.session_id}, duration: #{message.duration_ms}ms")

          # Yield completion info with the NEW session_id for the next message
          yield({
            type: "complete",
            session_id: message.session_id, # This is the session ID to use for the next message!
            duration_ms: message.duration_ms,
            cost: message.total_cost_usd,
            turns: message.num_turns,
            accumulated_text: accumulated_text,
          })
        end
      end
    rescue ClaudeSDK::CLINotFoundError => e
      Rails.logger.error("[ClaudeChatService] Claude Code CLI not found: #{e.message}")
      yield({ type: "error", content: "Claude Code CLI not found. Please ensure claude-code is installed and in your PATH." })
    rescue ClaudeSDK::CLIConnectionError => e
      Rails.logger.error("[ClaudeChatService] Connection error: #{e.message}")
      yield({ type: "error", content: "Connection error: #{e.message}" })
    rescue ClaudeSDK::ProcessError => e
      Rails.logger.error("[ClaudeChatService] Process error: #{e.message}")
      yield({ type: "error", content: "Process error: #{e.message}" })
    rescue StandardError => e
      Rails.logger.error("[ClaudeChatService] Unexpected error: #{e.message}")
      Rails.logger.error(e.backtrace.join("\n"))
      yield({ type: "error", content: "Unexpected error: #{e.message}" })
    end
  end

  private

  def handle_tool_use(content_block, pending_tools)
    # Tool is being used
    Rails.logger.info("[ClaudeChatService] Tool use: #{content_block.name}")

    # Track pending tool
    pending_tools[content_block.id] = {
      name: content_block.name,
      input: content_block.input,
    }

    # Yield tool usage info for display
    yield({
      type: "tool_use",
      id: content_block.id,
      name: content_block.name,
      input: content_block.input,
    })

    # Check if it's a file modification tool
    return unless ["Write", "Edit", "MultiEdit"].include?(content_block.name)

    file_path = content_block.input["file_path"]

    # Check if the modified file is our swarm file
    return unless file_path == @file_path || file_path&.end_with?(@file_path.split("/").last)

    Rails.logger.info("[ClaudeChatService] File modified: #{file_path}")
    yield({ type: "file_modified", path: @file_path })
  end

  def build_system_prompt
    <<~PROMPT
      You are a swarm configuration assistant helping to build and modify a YAML swarm configuration file.
      You are currently working with the file: #{@file_path}

      The file defines a swarm configuration for claude-swarm, which orchestrates multiple AI agents.

      YAML Structure:
      ```yaml
      version: 1
      swarm:
        name: "Swarm Name"
        instances:
          instance_name:
            description: "Role description"
            model: opus/sonnet/haiku
            directory: .
            prompt: |
              Detailed prompt for this agent
            vibe: true
            connections:
              - other_instance_name
        main: instance_name  # Entry point instance
      ```

      CRITICAL RULES FOR MODIFICATIONS:
      1. ALWAYS use the Read tool FIRST to see the current file content
      2. NEVER duplicate existing instances - check if an instance already exists before adding
      3. When updating an instance, use Edit to REPLACE the entire instance block, not append
      4. Instance names must be unique identifiers (snake_case preferred)
      5. The 'main' field must reference a valid instance name
      6. Connections must reference valid instance names that exist in the file
      7. Use proper YAML indentation (2 spaces per level)
      8. Preserve multiline prompt formatting with | indicator

      Common operations:
      - Adding a new instance: Check it doesn't exist, then add to instances section
      - Updating an instance: Use Edit to replace the ENTIRE instance definition
      - Adding connections: Edit the connections list of the specific instance
      - Changing main instance: Edit the main field at swarm level

      BEFORE ANY MODIFICATION:
      1. Use Read to see the current file
      2. Check if the instance/connection already exists
      3. Use Edit with enough context to ensure unique match
      4. For complex changes, use MultiEdit to make multiple precise edits

      Example of CORRECT instance update:
      - Use Edit to replace from "instance_name:" to the end of that instance block
      - Include enough context to uniquely identify the section being replaced

      You have access to file editing tools to modify the swarm configuration.
      Always explain what changes you're making and why.
    PROMPT
  end
end
