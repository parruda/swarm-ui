# frozen_string_literal: true

class SwarmTemplateInstance < ApplicationRecord
  # Associations
  belongs_to :swarm_template
  belongs_to :instance_template

  # Validations
  validates :instance_key,
    presence: true,
    uniqueness: { scope: :swarm_template_id },
    format: { with: /\A[a-z_]+\z/, message: "must be lowercase letters and underscores only" }

  # Scopes
  scope :ordered, -> { order(:position) }

  # Callbacks
  before_validation :set_default_position, on: :create

  # Instance methods
  def full_config
    # Merge instance template config with any overrides
    base_config = instance_template.to_instance_config(instance_key)

    if overrides.present?
      base_config.deep_merge(overrides)
    else
      base_config
    end
  end

  def connections
    overrides&.dig("connections") || []
  end

  def add_connection(target_instance_key)
    self.overrides ||= {}
    self.overrides["connections"] ||= []

    unless self.overrides["connections"].include?(target_instance_key)
      self.overrides["connections"] << target_instance_key
    end

    save
  end

  def remove_connection(target_instance_key)
    return unless overrides&.dig("connections")

    self.overrides["connections"].delete(target_instance_key)
    save
  end

  private

  def set_default_position
    return if position.present?

    max_position = swarm_template.swarm_template_instances.maximum(:position) || 0
    self.position = max_position + 1
  end
end
