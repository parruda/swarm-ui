class CreateInstanceTemplates < ActiveRecord::Migration[8.0]
  def change
    create_table :instance_templates do |t|
      t.string :name, null: false
      t.text :description
      t.string :instance_type
      t.string :model, default: 'sonnet'
      t.text :prompt
      t.text :allowed_tools, array: true, default: []
      t.text :disallowed_tools, array: true, default: []
      t.boolean :vibe, default: false
      t.string :provider, default: 'claude'
      t.decimal :temperature, precision: 3, scale: 2
      t.string :api_version
      t.string :openai_token_env
      t.text :base_url

      t.timestamps
    end
  end
end