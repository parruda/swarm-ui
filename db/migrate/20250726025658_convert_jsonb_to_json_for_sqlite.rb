# frozen_string_literal: true

class ConvertJsonbToJsonForSqlite < ActiveRecord::Migration[8.0]
  def up
    # Skip if using SQLite (columns are already JSON)
    return if ActiveRecord::Base.connection.adapter_name == "SQLite"

    # For PostgreSQL, convert JSONB to JSON
    change_column(:instance_templates, :tools, :json)
    change_column(:instance_templates, :allowed_tools, :json)
    change_column(:instance_templates, :disallowed_tools, :json)
    change_column(:projects, :preferred_models, :json, default: {})
    change_column(:sessions, :metadata, :json)
    change_column(:swarm_templates, :instance_config, :json)
  end

  def down
    # Skip if using SQLite
    return if ActiveRecord::Base.connection.adapter_name == "SQLite"

    # For PostgreSQL, convert back to JSONB
    change_column(:instance_templates, :tools, :jsonb)
    change_column(:instance_templates, :allowed_tools, :jsonb)
    change_column(:instance_templates, :disallowed_tools, :jsonb)
    change_column(:projects, :preferred_models, :jsonb, default: {})
    change_column(:sessions, :metadata, :jsonb)
    change_column(:swarm_templates, :instance_config, :jsonb)
  end
end
