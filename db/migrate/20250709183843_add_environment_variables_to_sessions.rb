class AddEnvironmentVariablesToSessions < ActiveRecord::Migration[8.0]
  def change
    add_column :sessions, :environment_variables, :text
  end
end
