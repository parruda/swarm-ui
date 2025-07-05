class Directory < ApplicationRecord
  belongs_to :default_swarm_configuration, class_name: 'SwarmConfiguration', optional: true
  
  validates :path, presence: true, uniqueness: true
end