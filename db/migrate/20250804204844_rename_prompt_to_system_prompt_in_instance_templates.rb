# frozen_string_literal: true

class RenamePromptToSystemPromptInInstanceTemplates < ActiveRecord::Migration[8.0]
  def change
    rename_column(:instance_templates, :prompt, :system_prompt)
  end
end
