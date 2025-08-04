# frozen_string_literal: true

module Api
  class SwarmFilesController < ApplicationController
    skip_before_action :verify_authenticity_token # For API endpoints

    def read
      path = params[:path]

      unless path.present? && File.exist?(path)
        render(json: { error: "File not found" }, status: :not_found)
        return
      end

      begin
        yaml_content = File.read(path)
        render(json: { yaml_content: yaml_content, path: path })
      rescue => e
        render(json: { error: "Error reading file: #{e.message}" }, status: :internal_server_error)
      end
    end

    def notify_change
      project_id = params[:project_id]
      file_path = params[:file_path]

      # Broadcast to the builder channel
      ActionCable.server.broadcast(
        "project_#{project_id}_builder",
        {
          action: "refresh_canvas",
          file_path: file_path,
          timestamp: Time.current.to_i,
        },
      )

      render(json: { success: true })
    end
  end
end