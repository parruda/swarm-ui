class AddInitialPromptToSessions < ActiveRecord::Migration[8.0]
  def change
    add_column :sessions, :initial_prompt, :text
  end
end
