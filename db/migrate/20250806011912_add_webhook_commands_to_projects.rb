# frozen_string_literal: true

class AddWebhookCommandsToProjects < ActiveRecord::Migration[8.0]
  def change
    add_column(:projects, :webhook_commands, :json, default: [])
  end
end
