# frozen_string_literal: true

class AddGithubUsernameToSettings < ActiveRecord::Migration[8.0]
  def change
    add_column(:settings, :github_username, :string)
  end
end
