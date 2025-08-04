# frozen_string_literal: true

module Api
  class ClaudeChatController < ApplicationController
    def create
      @project = Project.find(params[:project_id])
      @file_path = params[:file_path]
      @prompt = params[:prompt]
      received_conversation_id = params[:conversation_id].presence
      @message_id = SecureRandom.hex(8)
      
      # Parse the conversation data which may contain both tracking_id and session_id
      # Format: "tracking_id:session_id" or just "tracking_id" for first message
      if received_conversation_id&.include?(":")
        tracking_id, session_id = received_conversation_id.split(":", 2)
        @conversation_id = tracking_id  # For broadcasts
        service_conversation_id = session_id  # For Claude SDK resume
      else
        # First message or legacy format
        @conversation_id = received_conversation_id || SecureRandom.uuid
        service_conversation_id = nil  # Don't resume for first message
      end

      # Validate file exists
      unless File.exist?(@file_path)
        broadcast_error_message("File not found: #{@file_path}")
        return
      end

      # Add user message to chat
      broadcast_user_message(@prompt)
      
      # Show typing indicator
      broadcast_typing_indicator

      # Run Claude in background job for better performance
      ClaudeChatJob.perform_later(
        project_id: @project.id,
        file_path: @file_path,
        prompt: @prompt,
        conversation_id: service_conversation_id,  # Pass nil for new conversations
        message_id: @message_id,
        tracking_id: @conversation_id,  # Pass the tracking ID separately
      )

      head :ok
    end

    private

    def broadcast_user_message(content)
      Turbo::StreamsChannel.broadcast_append_to(
        "claude_chat_#{@project.id}_#{@conversation_id}",
        target: "chat_messages",
        partial: "api/claude_chat/message",
        locals: {
          role: "user",
          content: content,
          message_id: SecureRandom.hex(8),
        },
      )
    end

    def broadcast_typing_indicator
      Turbo::StreamsChannel.broadcast_append_to(
        "claude_chat_#{@project.id}_#{@conversation_id}",
        target: "chat_messages",
        partial: "api/claude_chat/typing_indicator",
        locals: {
          indicator_id: "typing_indicator_#{@message_id}"
        },
      )
    end

    def broadcast_error_message(content)
      Turbo::StreamsChannel.broadcast_append_to(
        "claude_chat_#{@project.id}_#{@conversation_id}",
        target: "chat_messages",
        partial: "api/claude_chat/message",
        locals: {
          role: "error",
          content: content,
          message_id: SecureRandom.hex(8),
        },
      )
    end
  end
end