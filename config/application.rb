require_relative "boot"

require "rails/all"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module SwarmUi
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.0

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    config.time_zone = "UTC"
    # config.eager_load_paths << Rails.root.join("extras")

    # Claude Swarm specific configuration
    config.claude_swarm = ActiveSupport::OrderedOptions.new
    
    # Path to claude-swarm sessions directory
    config.claude_swarm.sessions_path = File.expand_path("~/.claude-swarm/sessions")
    
    # Path to claude-swarm run directory (active sessions)
    config.claude_swarm.run_path = File.expand_path("~/.claude-swarm/run")
    
    # Path to claude-swarm worktrees directory
    config.claude_swarm.worktrees_path = File.expand_path("~/.claude-swarm/worktrees")
    
    # Default timeout for tmux operations (in seconds)
    config.claude_swarm.tmux_timeout = 10
    
    # Session cleanup settings
    config.claude_swarm.cleanup_after_days = 7
    config.claude_swarm.cleanup_orphaned_tmux = true
    
    # File watcher settings
    config.claude_swarm.enable_file_watching = true
    config.claude_swarm.file_watch_interval = 0.1 # seconds
    
    # Terminal settings
    config.claude_swarm.terminal_rows = 24
    config.claude_swarm.terminal_cols = 80
    
    # Temporary files path for configurations
    config.claude_swarm.temp_configs_path = Rails.root.join("tmp", "configs")
    
    # Output files path for non-interactive sessions
    config.claude_swarm.output_files_path = Rails.root.join("tmp", "swarm_outputs")
  end
end
