# frozen_string_literal: true

class CreateProjects < ActiveRecord::Migration[8.0]
  def change
    create_table(:projects) do |t|
      t.string(:name, null: false)
      t.string(:path, null: false)
      t.string(:vcs_type) # 'git' or 'none'
      t.string(:default_config_path)
      t.boolean(:default_use_worktree, default: false)
      t.boolean(:archived, default: false)

      # Metadata
      t.datetime(:last_session_at)
      t.integer(:total_sessions_count, default: 0)
      t.integer(:active_sessions_count, default: 0)

      # Advanced features
      t.text(:environment_variables) # encrypted
      t.jsonb(:preferred_models, default: {})

      t.timestamps

      t.index(:path, unique: true)
      t.index(:archived)
    end
  end
end
