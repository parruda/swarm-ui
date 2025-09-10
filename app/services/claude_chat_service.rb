# frozen_string_literal: true

require "claude_sdk"
require "erb"

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
      system_prompt = build_append_system_prompt

      Rails.logger.info("[ClaudeChatService] System prompt: #{system_prompt}")

      # Configure options for Claude SDK
      options = ClaudeSDK::ClaudeCodeOptions.new(
        cwd: @project.path,
        append_system_prompt: system_prompt,
        allowed_tools: ["Read", "Write", "Edit", "MultiEdit", "Bash", "LS", "Grep"],
        permission_mode: :accept_edits,
        model: "sonnet", # Use Sonnet model
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

  def build_append_system_prompt
    # Find the claude_swarm gem directory
    gem_spec = Gem::Specification.find_by_name("claude_swarm")
    gem_dir = gem_spec.gem_dir

    # Read the ERB template from the gem
    template_path = File.join(gem_dir, "lib", "claude_swarm", "templates", "generation_prompt.md.erb")
    raise "Template not found at #{template_path}" unless File.exist?(template_path)

    # Read the README.md from the gem
    readme_path = File.join(gem_dir, "README.md")
    readme_content = if File.exist?(readme_path)
      File.read(readme_path)
    else
      "README.md not found in claude-swarm gem"
    end

    # Set up variables for ERB rendering
    output_file = @file_path

    # Read and render the ERB template
    template_content = File.read(template_path)
    erb = ERB.new(template_content)

    # Render with binding that includes the required variables
    base_prompt = erb.result(binding)

    # Add important instructions
    base_prompt += "\n\n**IMPORTANT INSTRUCTIONS:**\n"
    base_prompt += "- Do not create circular dependencies when configuring swarms or adding MCP servers.\n"
    base_prompt += "- Do not provide users with commands to run claude-swarm. Instead, tell them to click the Launch button to start the swarm.\n"

    # Append MCP servers information
    mcp_servers = McpServer.ordered
    if mcp_servers.any?
      mcp_info = "\n\n## Available MCP Servers\n\n"
      mcp_info += "The following MCP servers are available and can be integrated into your swarm:\n\n"

      mcp_servers.each do |server|
        mcp_info += "### #{server.display_name} (#{server.name})\n"
        mcp_info += "- **Type:** #{server.server_type_display}\n"
        mcp_info += "- **Description:** #{server.description}\n" if server.description.present?
        mcp_info += "- **Tags:** #{server.tags_string}\n" if server.tags.present? && server.tags.any?

        if server.stdio?
          mcp_info += "- **Command:** `#{server.command}`\n"
          mcp_info += "- **Args:** #{server.args.join(", ")}\n" if server.args.present? && server.args.any?
        elsif server.sse?
          mcp_info += "- **URL:** #{server.url}\n"
        end

        mcp_info += "\n"
      end

      mcp_info += "To use any of these MCP servers in your swarm, add them as allowed tools with the 'mcp__' prefix.\n"
      mcp_info += "For example, to use '#{mcp_servers.first.name}', add 'mcp__#{mcp_servers.first.name}' to the allowed_tools array.\n"

      base_prompt + mcp_info
    else
      base_prompt
    end
  end
end
