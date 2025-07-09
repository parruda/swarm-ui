class CreateSettings < ActiveRecord::Migration[8.0]
  def change
    create_table :settings do |t|
      t.string :openai_api_key

      t.timestamps
    end
  end
end
