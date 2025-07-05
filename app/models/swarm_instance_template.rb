class SwarmInstanceTemplate < ApplicationRecord
  belongs_to :swarm_configuration
  belongs_to :instance_template
end