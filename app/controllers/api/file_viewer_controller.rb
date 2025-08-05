# frozen_string_literal: true

module Api
  class FileViewerController < ApplicationController
    skip_before_action :verify_authenticity_token

    def list_files
      directory = params[:directory]

      unless directory.present? && File.directory?(directory)
        render(json: { error: "Invalid directory" }, status: :bad_request)
        return
      end

      # Security check - ensure directory is readable
      unless File.readable?(directory)
        render(json: { error: "Directory not readable" }, status: :forbidden)
        return
      end

      begin
        files = Dir.entries(directory).reject { |f| f.start_with?(".") }.map do |entry|
          full_path = File.join(directory, entry)
          {
            name: entry,
            type: File.directory?(full_path) ? "directory" : "file",
            size: File.directory?(full_path) ? nil : File.size(full_path),
            modified: File.mtime(full_path).iso8601,
          }
        end

        render(json: { files: files, directory: directory })
      rescue => e
        Rails.logger.error("Failed to list files: #{e.message}")
        render(json: { error: "Failed to list files: #{e.message}" }, status: :internal_server_error)
      end
    end

    def read_file
      filepath = params[:filepath]

      unless filepath.present? && File.file?(filepath)
        render(json: { error: "Invalid file path" }, status: :bad_request)
        return
      end

      # Security check - ensure file is readable
      unless File.readable?(filepath)
        render(json: { error: "File not readable" }, status: :forbidden)
        return
      end

      # Check file size (limit to 10MB)
      if File.size(filepath) > 10.megabytes
        render(json: { error: "File too large (max 10MB)" }, status: :unprocessable_entity)
        return
      end

      begin
        content = File.read(filepath)

        # Ensure valid UTF-8 encoding
        unless content.valid_encoding?
          content = content.encode("UTF-8", invalid: :replace, undef: :replace, replace: "?")
        end

        render(json: {
          content: content,
          filepath: filepath,
          filename: File.basename(filepath),
          size: File.size(filepath),
          modified: File.mtime(filepath).iso8601,
        })
      rescue => e
        Rails.logger.error("Failed to read file: #{e.message}")
        render(json: { error: "Failed to read file: #{e.message}" }, status: :internal_server_error)
      end
    end

    def save_file
      filepath = params[:filepath]
      content = params[:content]

      unless filepath.present? && File.file?(filepath)
        render(json: { error: "Invalid file path" }, status: :bad_request)
        return
      end

      # Security check - ensure file is writable
      unless File.writable?(filepath)
        render(json: { error: "File not writable" }, status: :forbidden)
        return
      end

      begin
        # Write new content directly without creating backup
        File.write(filepath, content)

        render(json: {
          success: true,
          message: "File saved successfully",
          filepath: filepath,
          size: File.size(filepath),
          modified: File.mtime(filepath).iso8601,
        })
      rescue => e
        Rails.logger.error("Failed to save file: #{e.message}")
        render(json: { error: "Failed to save file: #{e.message}" }, status: :internal_server_error)
      end
    end
  end
end
