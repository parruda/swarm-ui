class InstanceTemplate < ApplicationRecord
  has_many :swarm_instance_templates
  has_many :swarm_configurations, through: :swarm_instance_templates
  
  validates :name, presence: true
  validates :instance_type, inclusion: { 
    in: %w[frontend backend devops database testing documentation research] 
  }
  
  before_validation :set_default_temperature
  
  # Handle string input for tools (for compatibility with tests/forms)
  def allowed_tools=(value)
    if value.is_a?(String)
      super(value.split(',').map(&:strip))
    else
      super(value)
    end
  end
  
  def disallowed_tools=(value)
    if value.is_a?(String)
      super(value.split(',').map(&:strip))
    else
      super(value)
    end
  end
  
  private
  
  def set_default_temperature
    self.temperature ||= 0.0
  end
  
  public
  
  def to_yaml_hash
    {
      'description' => description,
      'model' => model,
      'prompt' => prompt,
      'allowed_tools' => allowed_tools.is_a?(Array) ? allowed_tools.join(',') : allowed_tools,
      'disallowed_tools' => disallowed_tools.is_a?(Array) ? disallowed_tools.join(',') : disallowed_tools,
      'vibe' => vibe,
      'provider' => provider,
      'temperature' => temperature,
      'api_version' => api_version,
      'openai_token_env' => openai_token_env,
      'base_url' => base_url
    }.reject { |_, v| v.nil? || v == '' || (v.is_a?(Array) && v.empty?) }
  end
end