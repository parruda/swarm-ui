class CreateMcpServers < ActiveRecord::Migration[8.0]
  def change
    create_table :mcp_servers do |t|
      t.string :name, null: false
      t.text :description
      t.string :server_type, null: false
      t.string :command
      t.string :url
      t.json :args, default: []
      t.json :env, default: {}
      t.json :headers, default: {}
      t.json :tags, default: []
      t.json :metadata, default: {}

      t.timestamps
    end

    add_index :mcp_servers, :name
    add_index :mcp_servers, :server_type
  end
end