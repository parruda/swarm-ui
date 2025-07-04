require 'fileutils'

class SwarmConfiguration < ApplicationRecord
  has_many :swarm_instance_templates, dependent: :destroy
  has_many :instance_templates, through: :swarm_instance_templates
  has_many :sessions
  has_many :directories, foreign_key: :default_swarm_configuration_id, dependent: :nullify
  
  validates :name, presence: true
  validates :config_yaml, presence: true
  
  def instance_count
    yaml_config['swarm']['instances'].size rescue 0
  end
  
  def yaml_config
    @yaml_config ||= YAML.safe_load(config_yaml)
  end
  
  def configuration
    yaml_config
  end
  
  def to_file(path)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, config_yaml)
  end
end