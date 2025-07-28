# frozen_string_literal: true

class InstanceTemplate < ApplicationRecord
  # Constants
  PROVIDERS = ["claude", "openai"].freeze
  CLAUDE_MODELS = ["opus", "sonnet"].freeze
  OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3-mini"].freeze
  API_VERSIONS = ["chat_completion", "responses"].freeze
  REASONING_EFFORTS = ["low", "medium", "high"].freeze
  CATEGORIES = ["frontend", "backend", "security", "database", "devops", "testing", "general"].freeze
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
  validates :category, inclusion: { in: CATEGORIES }, allow_nil: true
  validates :config, presence: true
  validate :config_structure
  # validate :model_matches_provider # Allow any model name for flexibility
  validate :reasoning_effort_for_o_series_only

  # Callbacks
  after_save :extract_required_variables, if: :saved_change_to_config?

  # Scopes
  scope :ordered, -> { order(:name) }
  scope :system, -> { where(system_template: true) }
  scope :custom, -> { where(system_template: false) }
  scope :by_category, ->(category) { where(category: category) }
  scope :claude, -> { where("config->>'provider' = ?", "claude") }
  scope :openai, -> { where("config->>'provider' = ?", "openai") }

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

  def prompt
    config&.dig("prompt")
  end

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

    # Extract from prompt
    if prompt.present? && prompt.include?("${")
      prompt.scan(/\$\{([^}:]+)(?::=[^}]*)?\}/) do |var|
        vars << var[0]
      end
    end

    self.required_variables = vars.uniq.sort
    save!(validate: false) if persisted?
  end
end
