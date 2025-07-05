ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "minitest/autorun"
require "mocha/minitest"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    # Note: We're using factories instead of fixtures
    # fixtures :all
    
    # Include route helpers in tests
    include Rails.application.routes.url_helpers

    # Include Factory Bot methods
    include FactoryBot::Syntax::Methods

    # Add more helper methods to be used by all tests here...
    
    # Set up temporary test directories
    setup do
      @test_root = Rails.root.join("tmp", "test", SecureRandom.hex(8))
      FileUtils.mkdir_p(@test_root)
      
      # Set up Claude Swarm test paths
      @test_sessions_path = @test_root.join(".claude-swarm", "sessions")
      @test_run_path = @test_root.join(".claude-swarm", "run")
      @test_worktrees_path = @test_root.join(".claude-swarm", "worktrees")
      
      FileUtils.mkdir_p(@test_sessions_path)
      FileUtils.mkdir_p(@test_run_path)
      FileUtils.mkdir_p(@test_worktrees_path)
      
      # Override Rails configuration for tests if claude_swarm config exists
      if Rails.configuration.respond_to?(:claude_swarm)
        Rails.configuration.claude_swarm.sessions_path = @test_sessions_path.to_s
        Rails.configuration.claude_swarm.run_path = @test_run_path.to_s
        Rails.configuration.claude_swarm.worktrees_path = @test_worktrees_path.to_s
      end
      
    end
    
    # Clean up test directories
    teardown do
      FileUtils.rm_rf(@test_root) if @test_root && File.exist?(@test_root)
    end
    
    # Helper method to create a mock session directory structure
    def create_mock_session_directory(session_id, options = {})
      project_name = options[:project_name] || "test_project"
      session_path = File.join(@test_sessions_path, project_name, session_id)
      FileUtils.mkdir_p(session_path)
      FileUtils.mkdir_p(File.join(session_path, "state"))
      FileUtils.mkdir_p(File.join(session_path, "pids"))
      
      # Create session metadata
      metadata = {
        session_id: session_id,
        swarm_name: options[:swarm_name] || "Test Swarm",
        start_time: Time.now.iso8601,
        start_directory: options[:start_directory] || "/tmp/test",
        worktree: options[:worktree],
        mode: options[:mode] || "interactive"
      }
      
      File.write(
        File.join(session_path, "session_metadata.json"),
        metadata.to_json
      )
      
      # Create config.yml
      config = options[:config] || {
        "version" => 1,
        "swarm" => {
          "name" => metadata[:swarm_name],
          "main" => "leader",
          "instances" => {
            "leader" => {
              "description" => "Main instance",
              "model" => "sonnet",
              "prompt" => "Test prompt"
            }
          }
        }
      }
      
      File.write(
        File.join(session_path, "config.yml"),
        config.to_yaml
      )
      
      # Create log files
      FileUtils.touch(File.join(session_path, "session.log"))
      FileUtils.touch(File.join(session_path, "session.log.json"))
      
      # Create active session symlink if requested
      if options[:active]
        symlink_path = File.join(@test_run_path, session_id)
        File.symlink(session_path, symlink_path) unless File.exist?(symlink_path)
      end
      
      session_path
    end
    
    # Helper method to create a mock tmux session
    def mock_tmux_session(session_name, exists: true)
      TmuxManager.any_instance.stubs(:session_exists?).with(session_name).returns(exists)
      system_mock = mock()
      system_mock.stubs(:call).returns(exists)
      Kernel.stubs(:system).with("tmux", "has-session", "-t", session_name).returns(exists)
    end
    
    # Helper method to mock system calls
    def mock_system_call(command, success: true, output: "")
      if success
        Kernel.stubs(:system).with(*command).returns(true)
        Open3.stubs(:capture2e).with(*command).returns([output, mock(success?: true)])
      else
        Kernel.stubs(:system).with(*command).returns(false)
        Open3.stubs(:capture2e).with(*command).returns([output, mock(success?: false)])
      end
    end
    
    # Helper method to create test JSONL log entries
    def create_log_entry(instance_name, event_type, event_data = {})
      {
        timestamp: Time.now.iso8601,
        instance: instance_name,
        instance_id: SecureRandom.uuid,
        event: {
          type: event_type
        }.merge(event_data)
      }.to_json
    end
    
    # Helper method to write JSONL log file
    def write_jsonl_log(session_path, entries)
      log_file = File.join(session_path, "session.log.json")
      File.open(log_file, "w") do |f|
        entries.each { |entry| f.puts(entry) }
      end
    end
  end
end

# Factory Bot Rails automatically loads factories from test/factories
# No need to call FactoryBot.find_definitions manually
