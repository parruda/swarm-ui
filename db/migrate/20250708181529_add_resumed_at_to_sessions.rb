class AddResumedAtToSessions < ActiveRecord::Migration[8.0]
  def change
    add_column :sessions, :resumed_at, :datetime
  end
end
