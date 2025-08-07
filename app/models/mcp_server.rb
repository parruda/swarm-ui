# frozen_string_literal: true

class McpServer < ApplicationRecord
  # Constants
  SERVER_TYPES = ["stdio", "sse"].freeze

  # Validations
  validates :name,
    presence: true,
    uniqueness: true,
    format: {
      with: /\A[a-z_]+\z/,
      message: "can only contain lowercase letters and underscores",
    }
  validates :server_type, presence: true, inclusion: { in: SERVER_TYPES }

  # Conditional validations based on server_type
  validates :command, presence: true, if: :stdio?
  validates :url, presence: true, if: :sse?

  # Scopes
  scope :by_type, ->(type) { where(server_type: type) }
  scope :with_tag, ->(tag) {
    # SQLite doesn't support @> operator, use LIKE instead
    where("LOWER(tags) LIKE LOWER(?)", "%\"#{tag}\"%")
  }
  scope :search, ->(query) {
    # SQLite uses LIKE for case-insensitive searches by default (unless PRAGMA case_sensitive_like is ON)
    # For consistent case-insensitive behavior, use LOWER()
    where("LOWER(name) LIKE LOWER(:q) OR LOWER(description) LIKE LOWER(:q) OR LOWER(tags) LIKE LOWER(:q)", q: "%#{query}%")
  }
  scope :ordered, -> { order(:name) }

  # Type checking methods
  def stdio?
    server_type == "stdio"
  end

  def sse?
    server_type == "sse"
  end

  # Configuration methods
  def to_mcp_config
    config = {
      "name" => name,
      "type" => server_type,
    }

    if stdio?
      config["command"] = command
      config["args"] = args if args.present? && args.any?
      config["env"] = env if env.present? && env.any?
    elsif sse?
      config["url"] = url
      config["headers"] = headers if headers.present? && headers.any?
    end

    config
  end

  # Tags handling
  def tags_string
    tags&.join(", ")
  end

  def tags_string=(value)
    self.tags = value.to_s.split(",").map(&:strip).reject(&:blank?).uniq
  end

  # Display helpers
  def display_name
    name.humanize
  end

  def server_type_display
    server_type&.upcase
  end

  # Usage tracking
  def usage_count
    # TODO: Track usage in swarm templates when that association is added
    0
  end

  # Clone method for duplication
  def duplicate
    dup.tap do |new_server|
      # Generate a unique name that follows the validation rules (lowercase and underscores only)
      base_name = "#{name}_copy"
      counter = 1
      new_name = base_name

      while McpServer.exists?(name: new_name)
        new_name = "#{base_name}_#{"a" * counter}"
        counter += 1
      end

      new_server.name = new_name
      new_server.tags = tags
      new_server.args = args
      new_server.env = env
      new_server.headers = headers
      new_server.metadata = metadata
    end
  end
end
