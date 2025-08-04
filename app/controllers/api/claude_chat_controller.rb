# frozen_string_literal: true

module Api
  class ClaudeChatController < ApplicationController
    def create
      @project = Project.find(params[:project_id])
      @file_path = params[:file_path]
      @prompt = params[:prompt]
      @tracking_id = params[:tracking_id].presence || SecureRandom.uuid
      @session_id = params[:session_id].presence # Claude session ID from previous message
      @message_id = SecureRandom.hex(8)

      Rails.logger.info("[ClaudeChatController] Tracking ID: #{@tracking_id}, Session ID: #{@session_id}")

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
        tracking_id: @tracking_id,
        session_id: @session_id,
        message_id: @message_id,
      )

      head(:ok)
    end

    private

    def broadcast_user_message(content)
      Turbo::StreamsChannel.broadcast_append_to(
        "claude_chat_#{@project.id}_#{@tracking_id}",
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
        "claude_chat_#{@project.id}_#{@tracking_id}",
        target: "chat_messages",
        partial: "api/claude_chat/typing_indicator",
        locals: {
          indicator_id: "typing_indicator_#{@message_id}",
        },
      )
    end

    def broadcast_error_message(content)
      Turbo::StreamsChannel.broadcast_append_to(
        "claude_chat_#{@project.id}_#{@tracking_id}",
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
