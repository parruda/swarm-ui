# frozen_string_literal: true

class MigrateSystemPromptDataInInstanceTemplates < ActiveRecord::Migration[8.0]
  def up
    InstanceTemplate.find_each do |template|
      # Check if there's a prompt in the config JSON that should move to the column
      if template.config.present?
        prompt_value = template.config["system_prompt"] || template.config["prompt"]

        if prompt_value.present? && template.system_prompt.blank?
          template.update_column(:system_prompt, prompt_value)
        end

        # Clean up the config by removing the prompt fields
        if template.config["system_prompt"].present? || template.config["prompt"].present?
          new_config = template.config.dup
          new_config.delete("system_prompt")
          new_config.delete("prompt")
          template.update_column(:config, new_config)
        end
      end
    end
  end

  def down
    # Move system_prompt back to config if reverting
    InstanceTemplate.find_each do |template|
      if template.system_prompt.present?
        new_config = template.config.dup
        new_config["system_prompt"] = template.system_prompt
        template.update_column(:config, new_config)
      end
    end
  end
end
