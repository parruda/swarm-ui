# frozen_string_literal: true

module McpServerImporters
  class SwarmUi < Base
    protected

    def servers_data
      @data.is_a?(Array) ? @data : [@data]
    end
  end
end
