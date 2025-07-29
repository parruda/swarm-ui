class AddTagsToInstanceTemplates < ActiveRecord::Migration[8.0]
  def change
    add_column :instance_templates, :tags, :json, default: []
    
    # Migrate existing categories to tags
    reversible do |dir|
      dir.up do
        InstanceTemplate.find_each do |template|
          if template.category.present?
            template.update_columns(tags: [template.category])
          end
        end
      end
    end
  end
end
