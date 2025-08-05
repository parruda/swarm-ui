# frozen_string_literal: true

class RemoveCategoryFromInstanceTemplates < ActiveRecord::Migration[8.0]
  def change
    remove_column(:instance_templates, :category, :string)
  end
end
