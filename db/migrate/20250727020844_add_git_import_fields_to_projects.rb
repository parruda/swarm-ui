# frozen_string_literal: true

class AddGitImportFieldsToProjects < ActiveRecord::Migration[8.0]
  def change
    add_column(:projects, :git_url, :string)
    add_column(:projects, :import_status, :string, default: nil)
    add_column(:projects, :import_error, :text)
    add_column(:projects, :import_started_at, :datetime)
    add_column(:projects, :import_completed_at, :datetime)

    add_index(:projects, :import_status)
  end
end
