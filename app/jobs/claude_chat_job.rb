# frozen_string_literal: true

class ClaudeChatJob < ApplicationJob
  queue_as :default

  def perform(project_id:, file_path:, prompt:, conversation_id:, message_id:)
    project = Project.find(project_id)
    actual_session_id = nil
    current_tool_id = nil
    typing_indicator_removed = false
    
    service = ClaudeChatService.new(
      project: project,
      file_path: file_path,
      conversation_id: conversation_id,
    )

    service.chat(prompt) do |message|
      # Remove typing indicator on first response
      unless typing_indicator_removed
        broadcast_remove_typing_indicator(project_id, conversation_id, message_id)
        typing_indicator_removed = true
      end
      
      case message[:type]
      when "text"
        # Mark previous tool as complete if there was one
        if current_tool_id
          broadcast_tool_complete(project_id, conversation_id, current_tool_id)
          current_tool_id = nil
        end
        
        # Append text as a new message, don't update
        broadcast_assistant_message(project_id, conversation_id, message[:content])

      when "tool_use"
        # Mark previous tool as complete if there was one
        if current_tool_id
          broadcast_tool_complete(project_id, conversation_id, current_tool_id)
        end
        
        # Track current tool
        current_tool_id = message[:id]
        broadcast_tool_use(project_id, conversation_id, message)

      when "tool_result"
        # Mark the tool as complete with result
        broadcast_tool_result(project_id, conversation_id, message)
        
        # Clear current tool if it matches
        if current_tool_id == message[:tool_use_id]
          current_tool_id = nil
        end
        
      when "file_modified"
        broadcast_file_modified(project_id, conversation_id, file_path)
        broadcast_canvas_refresh(project_id, conversation_id, file_path)
        
      when "usage"
        # Skip usage info - not needed in UI
        
      when "thinking"
        # Skip thinking - not needed in production
        
      when "complete"
        # Mark any pending tool as complete
        if current_tool_id
          broadcast_tool_complete(project_id, conversation_id, current_tool_id)
          current_tool_id = nil
        end
        
        # Claude is done! Capture session ID
        actual_session_id = message[:session_id]
        broadcast_session_update(project_id, conversation_id, actual_session_id)
        broadcast_enable_input(project_id, conversation_id)

      when "error"
        # Mark any pending tool as error
        if current_tool_id
          broadcast_tool_error(project_id, conversation_id, current_tool_id)
          current_tool_id = nil
        end
        
        broadcast_error(project_id, conversation_id, message[:content])
      end
    end
  end

  private

  def broadcast_assistant_message(project_id, conversation_id, content)
    # Append a new assistant message
    Turbo::StreamsChannel.broadcast_append_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "chat_messages",
      partial: "api/claude_chat/message",
      locals: {
        role: "assistant",
        content: content,
        message_id: SecureRandom.hex(8),
        streaming: false,
      },
    )
  end

  def broadcast_tool_use(project_id, conversation_id, tool_data)
    Turbo::StreamsChannel.broadcast_append_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "chat_messages",
      partial: "api/claude_chat/tool_use",
      locals: {
        tool_id: tool_data[:id],
        tool_name: tool_data[:name],
        tool_input: tool_data[:input],
      },
    )
  end

  def broadcast_tool_complete(project_id, conversation_id, tool_id)
    # Just update the status to complete
    Turbo::StreamsChannel.broadcast_replace_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "tool_#{tool_id}_status",
      html: <<~HTML
        <div class="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <span>Done</span>
        </div>
      HTML
    )
  end
  
  def broadcast_tool_error(project_id, conversation_id, tool_id)
    # Update the status to error
    Turbo::StreamsChannel.broadcast_replace_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "tool_#{tool_id}_status",
      html: <<~HTML
        <div class="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
          <span>Error</span>
        </div>
      HTML
    )
  end

  def broadcast_tool_result(project_id, conversation_id, result_data)
    # If there's significant output, show it in a collapsible
    if result_data[:content].present? && result_data[:content].to_s.length > 50
      Turbo::StreamsChannel.broadcast_append_to(
        "claude_chat_#{project_id}_#{conversation_id}",
        target: "tool_#{result_data[:tool_use_id]}_output",
        partial: "api/claude_chat/tool_output",
        locals: {
          content: result_data[:content],
          is_error: result_data[:is_error],
        },
      )
    end
    
    # Update status
    if result_data[:is_error]
      broadcast_tool_error(project_id, conversation_id, result_data[:tool_use_id])
    else
      broadcast_tool_complete(project_id, conversation_id, result_data[:tool_use_id])
    end
  end

  def broadcast_file_modified(project_id, conversation_id, file_path)
    Turbo::StreamsChannel.broadcast_append_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "chat_messages",
      partial: "api/claude_chat/file_modified",
      locals: { file_path: file_path },
    )
  end

  def broadcast_canvas_refresh(project_id, conversation_id, file_path)
    Turbo::StreamsChannel.broadcast_append_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "chat_messages",
      html: <<~HTML
        <script>
          window.dispatchEvent(new CustomEvent('canvas:refresh', { 
            detail: { filePath: '#{file_path}' }
          }));
        </script>
      HTML
    )
  end

  def broadcast_error(project_id, conversation_id, error_message)
    Turbo::StreamsChannel.broadcast_append_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "chat_messages",
      partial: "api/claude_chat/message",
      locals: {
        role: "error",
        content: error_message,
        message_id: SecureRandom.hex(8),
      },
    )
    
    # Enable input on error
    broadcast_enable_input(project_id, conversation_id)
  end
  
  def broadcast_session_update(project_id, conversation_id, session_id)
    # Broadcast the actual session ID so the client can use it for the next message
    Turbo::StreamsChannel.broadcast_append_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "chat_messages",
      html: <<~HTML
        <script>
          window.dispatchEvent(new CustomEvent('session:update', { 
            detail: { sessionId: '#{session_id}' }
          }));
        </script>
      HTML
    )
  end
  
  def broadcast_enable_input(project_id, conversation_id)
    # Re-enable the input form
    Turbo::StreamsChannel.broadcast_append_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "chat_messages",
      html: <<~HTML
        <script>
          window.dispatchEvent(new CustomEvent('chat:complete'));
        </script>
      HTML
    )
  end
  
  def broadcast_remove_typing_indicator(project_id, conversation_id, message_id)
    # Remove the typing indicator
    Turbo::StreamsChannel.broadcast_remove_to(
      "claude_chat_#{project_id}_#{conversation_id}",
      target: "typing_indicator_#{message_id}"
    )
  end
end