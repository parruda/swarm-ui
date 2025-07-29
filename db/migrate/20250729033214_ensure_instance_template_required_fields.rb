# frozen_string_literal: true

class EnsureInstanceTemplateRequiredFields < ActiveRecord::Migration[8.0]
  def up
    # First, update any instance templates that are missing system_prompt or directory
    InstanceTemplate.find_each do |template|
      updated_config = template.config.dup

      # Ensure directory is set
      if updated_config["directory"].blank?
        updated_config["directory"] = "."
      end

      # Ensure system_prompt is set
      if updated_config["system_prompt"].blank?
        updated_config["system_prompt"] = "You are a helpful AI assistant for #{template.name}."
      end

      # Update if changes were made
      if updated_config != template.config
        template.update_columns(config: updated_config)
      end
    end

    # NOTE: We can't add database constraints on JSON fields directly,
    # so we'll enforce this in the model validations
  end

  def down
    # Nothing to do
  end
end
