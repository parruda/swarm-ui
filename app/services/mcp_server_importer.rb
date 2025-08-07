# frozen_string_literal: true

class McpServerImporter
  class << self
    def import(file)
      importer = detect_format_and_build_importer(file)
      importer.import
    end

    private

    def detect_format_and_build_importer(file)
      # Reset file position after reading
      content = file.read
      file.rewind

      data = JSON.parse(content)

      if !data.is_a?(Array) && data&.key?("mcpServers")
        # Cursor IDE format
        McpServerImporters::Cursor.new(file)
      elsif !data.is_a?(Array) && data.dig("mcp", "servers")
        # VS Code format
        McpServerImporters::Vscode.new(file)
      else
        # SwarmUI format (handles both single object and array)
        McpServerImporters::SwarmUi.new(file)
      end
    rescue JSON::ParserError
      # If we can't parse JSON, default to SwarmUI importer which will handle the error
      McpServerImporters::SwarmUi.new(file)
    end
  end
end
