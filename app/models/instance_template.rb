# frozen_string_literal: true

class InstanceTemplate < ApplicationRecord
  # Constants
  PROVIDERS = ["claude", "openai"].freeze
  CLAUDE_MODELS = ["opus", "sonnet"].freeze
  OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3-mini"].freeze
  API_VERSIONS = ["chat_completion", "responses"].freeze
  REASONING_EFFORTS = ["low", "medium", "high"].freeze
  AVAILABLE_TOOLS = [
    "Bash",
    "Edit",
    "Glob",
    "Grep",
    "LS",
    "MultiEdit",
    "NotebookEdit",
    "NotebookRead",
    "Read",
    "Task",
    "TodoWrite",
    "WebFetch",
    "WebSearch",
    "Write",
  ].freeze

  # Associations
  has_many :swarm_template_instances, dependent: :destroy
  has_many :swarm_templates, through: :swarm_template_instances

  # Validations
  validates :name, presence: true, uniqueness: true
  validates :description, presence: true
  validates :system_prompt, presence: true
  validates :config, presence: true
  validate :config_structure
  # validate :model_matches_provider # Allow any model name for flexibility
  validate :reasoning_effort_for_o_series_only
  validate :required_config_fields

  # Callbacks
  before_validation :set_openai_defaults
  after_save :extract_required_variables, if: :saved_change_to_config?

  # Scopes
  scope :ordered, -> { order(:name) }
  scope :system, -> { where(system_template: true) }
  scope :custom, -> { where(system_template: false) }
  scope :search, ->(query) {
    return all if query.blank?
    
    query = query.downcase
    where(
      "LOWER(name) LIKE :query OR LOWER(description) LIKE :query OR LOWER(CAST(tags AS TEXT)) LIKE :query OR LOWER(system_prompt) LIKE :query",
      query: "%#{query}%"
    )
  }
  scope :claude, -> { where("config->>'provider' = ?", "claude") }
  scope :openai, -> { where("config->>'provider' = ?", "openai") }
  scope :with_tag, ->(tag) { where("tags LIKE ?", "%#{tag}%") }

  # Class methods
  class << self
    def all_tags
      # Get all unique tags from all instance templates
      pluck(:tags).flatten.compact.uniq.sort
    end
  end

  # Instance methods
  def provider
    config&.dig("provider") || "claude"
  end

  def model
    config&.dig("model")
  end

  def directory
    config&.dig("directory") || "."
  end

  def allowed_tools
    config&.dig("allowed_tools") || []
  end
  
  def mcps
    config&.dig("mcps") || []
  end

  # Use the database column directly
  # (prompt was renamed to system_prompt in migration)

  def worktree
    config&.dig("worktree") || false
  end

  def vibe
    config&.dig("vibe") || false
  end

  def temperature
    config&.dig("temperature")
  end

  def api_version
    config&.dig("api_version")
  end

  def reasoning_effort
    config&.dig("reasoning_effort")
  end

  def claude?
    provider == "claude"
  end

  def openai?
    provider == "openai"
  end

  def o_series?
    model&.start_with?("o1", "o3")
  end

  def to_instance_config(instance_key = nil, overrides = {})
    base_config = config.merge(overrides)
    base_config["description"] ||= description

    # Use the system_prompt column value for the YAML 'prompt' field
    # This is required for claude-swarm compatibility
    base_config["prompt"] = system_prompt if system_prompt.present?

    # Remove any system_prompt from config to avoid duplication
    base_config.delete("system_prompt")
    
    # Include MCP servers if present
    if config["mcps"].present?
      base_config["mcps"] = config["mcps"]
    end

    # Remove provider-specific fields for wrong provider
    if claude?
      base_config.except!("temperature", "api_version", "reasoning_effort", "openai_token_env", "base_url")
    else
      # OpenAI always vibe mode
      base_config["vibe"] = true
    end

    base_config
  end

  def duplicate(new_name)
    new_template = dup
    new_template.name = new_name
    new_template.system_template = false
    new_template.usage_count = 0
    new_template
  end

  def add_tag(tag)
    return if tag.blank?

    normalized_tag = tag.downcase.strip
    self.tags ||= []
    self.tags << normalized_tag unless tags.include?(normalized_tag)
    save
  end

  def remove_tag(tag)
    return if tag.blank?

    self.tags ||= []
    self.tags.delete(tag.downcase.strip)
    save
  end

  def tagged_with?(tag)
    tags&.include?(tag.downcase.strip)
  end

  private

  def config_structure
    return unless config.present?

    unless config.is_a?(Hash)
      errors.add(:config, "must be a hash")
      return
    end

    # Required fields in config
    unless config["model"].present?
      errors.add(:config, "must include 'model'")
    end

    # Validate tools if present
    if config["allowed_tools"].present?
      if config["allowed_tools"].is_a?(Array)
        invalid_tools = config["allowed_tools"] - AVAILABLE_TOOLS
        if invalid_tools.any?
          errors.add(:config, "contains invalid tools: #{invalid_tools.join(", ")}")
        end
      else
        errors.add(:config, "'allowed_tools' must be an array")
      end
    end
  end

  def model_matches_provider
    return unless provider && model

    valid_models = claude? ? CLAUDE_MODELS : OPENAI_MODELS
    unless valid_models.include?(model)
      errors.add(:config, "model '#{model}' is not valid for #{provider} provider")
    end
  end

  def reasoning_effort_for_o_series_only
    return unless reasoning_effort.present? && !o_series?

    errors.add(:config, "reasoning_effort can only be set for o-series models")
  end

  def required_config_fields
    return unless config.present?

    # Validate required fields
    if config["directory"].blank?
      errors.add(:config, "must include 'directory'")
    end
  end

  def set_openai_defaults
    return unless config.present? && openai?

    # Set all tools for OpenAI
    config["allowed_tools"] = AVAILABLE_TOOLS.dup

    # Always set vibe to true for OpenAI
    config["vibe"] = true
  end

  def extract_required_variables
    vars = []

    # Extract from directory
    if directory.is_a?(String) && directory.include?("${")
      directory.scan(/\$\{([^}:]+)(?::=[^}]*)?\}/) do |var|
        vars << var[0]
      end
    elsif directory.is_a?(Array)
      directory.each do |dir|
        next unless dir.is_a?(String) && dir.include?("${")

        dir.scan(/\$\{([^}:]+)(?::=[^}]*)?\}/) do |var|
          vars << var[0]
        end
      end
    end

    # Extract from system_prompt
    if system_prompt.present? && system_prompt.include?("${")
      system_prompt.scan(/\$\{([^}:]+)(?::=[^}]*)?\}/) do |var|
        vars << var[0]
      end
    end

    self.required_variables = vars.uniq.sort
    save!(validate: false) if persisted?
  end
end
