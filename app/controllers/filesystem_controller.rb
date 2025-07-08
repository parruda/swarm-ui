# frozen_string_literal: true

class FilesystemController < ApplicationController
  def browse
    path = params[:path] || ENV["HOME"]
    path = File.expand_path(path)

    # Security: ensure we're not going outside allowed paths
    unless allowed_path?(path)
      render(json: { error: "Access denied" }, status: :forbidden)
      return
    end

    entries = []

    if File.directory?(path)
      Dir.entries(path).sort.each do |entry|
        next if entry.start_with?(".")

        full_path = File.join(path, entry)
        next unless File.exist?(full_path)

        begin
          stat = File.stat(full_path)
          # Only include directories
          next unless stat.directory?
          
          entries << {
            name: entry,
            path: full_path,
            is_directory: true,
          }
        rescue SystemCallError
          # Skip files we can't stat
        end
      end
    end

    render(json: {
      current_path: path,
      entries: entries,
    })
  end

  def scan_swarm_configs
    path = params[:path]
    return render(json: { configs: [] }) unless path.present?

    path = File.expand_path(path)
    unless allowed_path?(path) && File.directory?(path)
      render(json: { error: "Invalid directory" }, status: :bad_request)
      return
    end

    configs = []

    # Scan directory for YAML files
    Dir.glob(File.join(path, "**/*.{yml,yaml}")).each do |file|
      next unless valid_swarm_config?(file)

      configs << {
        path: file,
        relative_path: file.sub("#{path}/", ""),
      }
    end

    render(json: { configs: configs })
  end

  private

  def allowed_path?(path)
    # Only allow access to user's home directory and subdirectories
    home = File.expand_path(ENV["HOME"])
    expanded_path = File.expand_path(path)
    expanded_path.start_with?(home)
  end

  def valid_swarm_config?(file_path)
    return false unless File.exist?(file_path)

    begin
      config = YAML.load_file(file_path)

      # Basic structure checks
      return false unless config.is_a?(Hash)
      return false unless config["version"] == 1
      return false unless config["swarm"].is_a?(Hash)

      swarm = config["swarm"]
      return false unless swarm["name"].is_a?(String)
      return false unless swarm["main"].is_a?(String)
      return false unless swarm["instances"].is_a?(Hash)
      return false if swarm["instances"].empty?

      # Check main instance exists
      return false unless swarm["instances"].key?(swarm["main"])

      # Check each instance has description
      swarm["instances"].each do |_name, instance|
        return false unless instance.is_a?(Hash)
        return false unless instance["description"].is_a?(String)
      end

      true
    rescue Psych::SyntaxError
      false
    rescue StandardError
      false
    end
  end
end
