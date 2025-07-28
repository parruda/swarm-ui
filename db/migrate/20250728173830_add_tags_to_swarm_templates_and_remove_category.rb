class AddTagsToSwarmTemplatesAndRemoveCategory < ActiveRecord::Migration[8.0]
  def change
    # Add tags array field
    add_column :swarm_templates, :tags, :json, default: []
    
    # Remove category field
    remove_column :swarm_templates, :category, :string
    
    # Add shared/public flags for better cross-project usage
    add_column :swarm_templates, :public, :boolean, default: false
    add_index :swarm_templates, :public
  end
end