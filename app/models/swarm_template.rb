# frozen_string_literal: true

class SwarmTemplate < ApplicationRecord
  # Validations
  validates :name, presence: true, uniqueness: true
  validates :main_instance, presence: true
  validate :main_instance_exists_in_config
  validate :instance_config_structure

  # Scopes
  scope :ordered, -> { order(:name) }

  # Instance methods
  def instances
    instance_config&.dig("instances") || {}
  end

  def instance_names
    instances.keys
  end

  def connections
    instance_config&.dig("connections") || []
  end

  def instance_definition(instance_name)
    instances[instance_name]
  end

  def connections_for(instance_name)
    connections.select do |conn|
      conn["from"] == instance_name || conn["to"] == instance_name
    end
  end

  private

  def main_instance_exists_in_config
    return unless main_instance && instance_config

    # Ensure instance_config has proper structure before checking
    return unless instance_config.is_a?(Hash) && instance_config["instances"].is_a?(Hash)

    unless instance_names.include?(main_instance)
      errors.add(:main_instance, "must be defined in instance_config")
    end
  end

  def instance_config_structure
    return unless instance_config

    # Validate that instance_config has the expected structure
    unless instance_config.is_a?(Hash)
      errors.add(:instance_config, "must be a hash")
      return
    end

    # Check for required keys
    unless instance_config.key?("instances")
      errors.add(:instance_config, "must have 'instances' key")
    end

    # Validate instances structure
    if instance_config["instances"] && !instance_config["instances"].is_a?(Hash)
      errors.add(:instance_config, "'instances' must be a hash")
    end

    # Validate connections structure if present
    if instance_config["connections"]
      unless instance_config["connections"].is_a?(Array)
        errors.add(:instance_config, "'connections' must be an array")
        return
      end

      # Validate each connection
      instance_config["connections"].each_with_index do |conn, index|
        unless conn.is_a?(Hash) && conn["from"] && conn["to"]
          errors.add(:instance_config, "connection at index #{index} must have 'from' and 'to' keys")
        end
      end
    end
  end
end
