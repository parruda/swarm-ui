class CreateVersionCheckers < ActiveRecord::Migration[8.0]
  def change
    create_table :version_checkers do |t|
      t.string :remote_version
      t.datetime :checked_at
      t.integer :singleton_guard

      t.timestamps
    end
    
    add_index :version_checkers, :singleton_guard, unique: true
  end
end
