# frozen_string_literal: true

module McpServerImporters
  class Cursor < Base
    protected

    def servers_data
      return [] unless @data.is_a?(Hash) && @data["mcpServers"].is_a?(Hash)

      @data["mcpServers"].map do |server_name, config|
        convert_cursor_server(server_name, config)
      end
    end

    private

    def convert_cursor_server(server_name, config)
      converted_name = sanitize_name(server_name)

      server_type = case config["type"]
      when "streamable-http", "sse"
        "sse"
      when "stdio"
        "stdio"
      else
        config["type"] || "stdio"
      end

      server_data = {
        "name" => converted_name,
        "server_type" => server_type,
        "description" => "Imported from Cursor IDE configuration",
        "tags" => ["cursor-import"],
      }

      if server_type == "stdio"
        server_data["command"] = config["command"]
        server_data["args"] = config["args"] || []
        server_data["env"] = config["env"] || {}
      elsif server_type == "sse"
        server_data["url"] = config["url"]
        server_data["headers"] = config["headers"] || {}
      end

      server_data
    end
  end
end
