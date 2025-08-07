# frozen_string_literal: true

module McpServerImporters
  class Base
    MAX_FILE_SIZE = 10.megabytes

    attr_reader :errors

    def initialize(file)
      @file = file
      @errors = []
      @imported_count = 0
    end

    def import
      validate_file_size!
      parse_file
      process_servers
      build_result
    rescue JSON::ParserError => e
      add_error("Invalid JSON file: #{e.message}")
      build_result
    rescue StandardError => e
      add_error("Import failed: #{e.message}")
      build_result
    end

    protected

    def validate_file_size!
      if @file.size > MAX_FILE_SIZE
        raise StandardError, "File size exceeds maximum allowed (#{MAX_FILE_SIZE / 1.megabyte}MB)"
      end
    end

    def parse_file
      @data = JSON.parse(@file.read)
    end

    def process_servers
      servers_data.each do |server_data|
        result = import_single_server(server_data)
        if result[:success]
          @imported_count += 1
        else
          add_error(result[:error])
        end
      end
    end

    def servers_data
      raise NotImplementedError, "Subclasses must implement servers_data method"
    end

    def import_single_server(data)
      # Sanitize the name first to match validation rules
      original_name = data["name"] || data[:name]
      sanitized = sanitize_name(original_name)
      name = ensure_unique_name(sanitized)

      server = McpServer.new(
        name: name,
        description: data["description"] || data[:description],
        server_type: data["server_type"] || data[:server_type] || "stdio",
        command: data["command"] || data[:command],
        url: data["url"] || data[:url],
        args: data["args"] || data[:args] || [],
        env: data["env"] || data[:env] || {},
        headers: data["headers"] || data[:headers] || {},
        tags: data["tags"] || data[:tags] || [],
      )

      if server.save
        { success: true, server: server }
      else
        { success: false, error: "#{name}: #{server.errors.full_messages.join(", ")}" }
      end
    end

    def ensure_unique_name(original_name)
      return original_name unless McpServer.exists?(name: original_name)

      base_name = original_name

      # Try adding _copy first
      new_name = "#{base_name}_copy"
      return new_name unless McpServer.exists?(name: new_name)

      # If _copy exists, add letters (a, b, c, ...)
      ("a".."zzz").each do |suffix|
        new_name = "#{base_name}_copy_#{suffix}"
        return new_name unless McpServer.exists?(name: new_name)
      end

      # Fallback if somehow we have that many duplicates
      "#{base_name}_copy_#{SecureRandom.hex(4)}"
    end

    def sanitize_name(name)
      # Only allow lowercase letters and underscores as per model validation
      name.to_s
        .downcase
        .gsub(/[^a-z_]/, "_")  # Remove everything except lowercase letters and underscores
        .gsub(/_{2,}/, "_")    # Replace multiple underscores with single
        .gsub(/^_|_$/, "")     # Remove leading/trailing underscores
        .presence || "imported_server" # Fallback if name becomes empty
    end

    def add_error(message)
      @errors << message
    end

    def build_result
      {
        success: @errors.empty?,
        imported_count: @imported_count,
        errors: @errors,
      }
    end
  end
end
