# frozen_string_literal: true

module McpServerImporters
  class Vscode < Base
    protected

    def servers_data
      return [] unless @data.is_a?(Hash) && @data.dig("mcp", "servers").is_a?(Hash)

      @data["mcp"]["servers"].map do |server_name, config|
        convert_vscode_server(server_name, config)
      end
    end

    private

    def convert_vscode_server(server_name, config)
      converted_name = sanitize_name(server_name)

      # Detect server type based on fields present in config
      server_type = detect_server_type(config)

      server_data = {
        "name" => converted_name,
        "server_type" => server_type,
        "description" => "Imported from VS Code MCP configuration",
        "tags" => ["vscode-import"],
      }

      # Add appropriate fields based on detected server type
      if server_type == "stdio"
        server_data["command"] = config["command"]
        server_data["args"] = config["args"] || []
        server_data["env"] = config["env"] || {}
      elsif server_type == "sse"
        server_data["url"] = config["url"]
        server_data["headers"] = config["headers"] || {}
        server_data["env"] = config["env"] || {}
      end

      server_data
    end

    def detect_server_type(config)
      if config["url"].present?
        "sse"
      elsif config["command"].present?
        "stdio"
      else
        "stdio" # Default fallback
      end
    end
  end
end
