# frozen_string_literal: true

class SwarmTemplate < ApplicationRecord
  # Constants

  # Associations
  belongs_to :project, optional: true # nil means general-purpose template
  has_many :swarm_template_instances, dependent: :destroy
  has_many :instance_templates, through: :swarm_template_instances

  # Validations
  validates :name, presence: true, uniqueness: { scope: :project_id }
  validate :config_data_structure
  validate :main_instance_exists

  # Callbacks
  after_save :invalidate_yaml_cache, if: :saved_change_to_config_data?
  after_save :increment_usage_on_create

  # Scopes
  scope :ordered, -> { order(:name) }
  scope :system, -> { where(system_template: true) }
  scope :custom, -> { where(system_template: false) }
  scope :general_purpose, -> { where(project_id: nil) }
  scope :for_project, ->(project) { where(project_id: [nil, project.id]) }
  scope :with_tag, ->(tag) { where("tags LIKE ?", "%#{tag}%") }
  scope :public_swarms, -> { where(public: true) }

  # Class methods
  class << self
    def all_tags
      # Get all unique tags from all swarm templates
      pluck(:tags).flatten.compact.uniq.sort
    end
  end

  # Instance methods
  def swarm_name
    config_data&.dig("swarm", "name") || name
  end
  
  # Returns visual builder data if stored (for compatibility with visual builder view)
  def visual_data
    nil
  end
  
  # Returns YAML content if generated (for compatibility with visual builder view)
  def yaml_content
    to_yaml rescue nil
  end

  def main_instance
    config_data&.dig("swarm", "main")
  end

  def instances
    config_data&.dig("swarm", "instances") || {}
  end

  def instance_names
    instances.keys
  end

  def required_environment_variables
    metadata&.dig("required_variables") || extract_required_variables
  end

  def to_yaml
    return yaml_cache if yaml_cache_valid?

    self.yaml_cache = generate_yaml
    self.yaml_cache_generated_at = Time.current
    save!(validate: false) if persisted?
    yaml_cache
  end

  def duplicate_for(project: nil, name: nil)
    new_template = dup
    new_template.project = project
    new_template.name = name || "Copy of #{self.name}"
    new_template.system_template = false
    new_template.usage_count = 0
    new_template.yaml_cache = nil
    new_template.yaml_cache_generated_at = nil
    new_template
  end

  def apply_environment_variables(env_vars)
    yaml_content = to_yaml
    env_vars.each do |key, value|
      yaml_content.gsub!(/\$\{#{key}(?::=[^}]*)?\}/, value)
    end
    yaml_content
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

  def yaml_cache_valid?
    yaml_cache.present? &&
      yaml_cache_generated_at.present? &&
      yaml_cache_generated_at > updated_at
  end

  def generate_yaml
    YAML.dump(config_data).sub(/\A---\n/, "")
  end

  def extract_required_variables
    vars = Set.new

    # Extract from instance directories
    instances.each do |_name, config|
      if config["directory"].is_a?(String)
        config["directory"].scan(/\$\{([^}:]+)(?::=[^}]*)?\}/) do |var|
          vars << var[0]
        end
      elsif config["directory"].is_a?(Array)
        config["directory"].each do |dir|
          dir.scan(/\$\{([^}:]+)(?::=[^}]*)?\}/) do |var|
            vars << var[0]
          end
        end
      end
    end

    # Extract from prompts
    instances.each do |_name, config|
      next unless config["prompt"]

      config["prompt"].scan(/\$\{([^}:]+)(?::=[^}]*)?\}/) do |var|
        vars << var[0]
      end
    end

    vars.to_a.sort
  end

  def invalidate_yaml_cache
    self.yaml_cache = nil
    self.yaml_cache_generated_at = nil
  end

  def increment_usage_on_create
    nil unless saved_change_to_id? # Only on create
    # Track usage when templates are used (implement in controller)
  end

  def config_data_structure
    return if config_data.blank?

    # Validate that config_data has the expected structure
    unless config_data.is_a?(Hash)
      errors.add(:config_data, "must be a hash")
      return
    end

    # Check for required keys
    unless config_data.key?("version")
      errors.add(:config_data, "must have 'version' key")
    end

    unless config_data.key?("swarm")
      errors.add(:config_data, "must have 'swarm' key")
    end

    # Validate swarm structure
    if config_data["swarm"]
      unless config_data["swarm"].is_a?(Hash)
        errors.add(:config_data, "'swarm' must be a hash")
        return
      end

      unless config_data["swarm"].key?("instances")
        errors.add(:config_data, "'swarm' must have 'instances' key")
      end

      if config_data["swarm"]["instances"] && !config_data["swarm"]["instances"].is_a?(Hash)
        errors.add(:config_data, "'swarm.instances' must be a hash")
      end
    end
  end

  def main_instance_exists
    return unless config_data&.dig("swarm", "main").present?

    main = config_data.dig("swarm", "main")
    instances_hash = config_data.dig("swarm", "instances") || {}

    unless instances_hash.key?(main)
      errors.add(:config_data, "main instance '#{main}' must be defined in instances")
    end
  end
end
