require 'json'

class Session < ApplicationRecord
  belongs_to :swarm_configuration, optional: true
  
  validates :session_id, presence: true, uniqueness: true
  
  scope :active, -> { where(status: 'active') }
  scope :completed, -> { where(status: 'completed') }
  
  def active?
    case mode
    when 'interactive'
      # Check if tmux session exists
      tmux_session.present? && system("tmux has-session -t #{tmux_session} 2>/dev/null")
    when 'non-interactive'
      # Check if process is still running
      pid && Process.kill(0, pid) rescue false
    end
  end
  
  def logs
    SessionLogReader.new(session_path).read_logs
  end
  
  def swarm_name
    # Read from session metadata if not stored
    self[:swarm_name] || read_session_metadata['swarm_name']
  end
  
  private
  
  def read_session_metadata
    metadata_file = File.join(session_path, 'session_metadata.json')
    File.exist?(metadata_file) ? JSON.parse(File.read(metadata_file)) : {}
  end
end