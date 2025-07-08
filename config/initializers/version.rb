# frozen_string_literal: true

module SwarmUI
  class << self
    def version
      File.read(Rails.root.join("VERSION")).strip
    end
  end
end
