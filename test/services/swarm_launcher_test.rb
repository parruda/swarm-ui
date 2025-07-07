# frozen_string_literal: true

require "test_helper"

class SwarmLauncherTest < ActiveSupport::TestCase
  setup do
    @config_hash = {
      "swarm" => { "main" => "test_instance" },
      "instances" => {
        "test_instance" => {
          "provider" => "anthropic",
          "tools" => ["Bash", "Edit"],
        },
      },
    }
  end

  test "initialize with session having swarm configuration" do
    swarm_config = create(:swarm_configuration, configuration: @config_hash)
    session = create(:session, swarm_configuration: swarm_config)
    launcher = SwarmLauncher.new(session)

    assert_not_nil launcher.instance_variable_get(:@session)
    assert_not_nil launcher.instance_variable_get(:@working_directory)
  end

  test "initialize with session having configuration hash" do
    session = create(:session, configuration_hash: @config_hash)
    launcher = SwarmLauncher.new(session)

    assert_equal @config_hash, launcher.instance_variable_get(:@config_hash)
  end

  test "launch_interactive creates tmux session name and updates session" do
    session = create(:session, configuration_hash: @config_hash, working_directory: "/home/user/project")
    launcher = SwarmLauncher.new(session)

    # Mock directory creation
    FileUtils.expects(:mkdir_p).with(session.session_path).returns(true)

    # Mock config file writing
    File.expects(:write).with(File.join(session.session_path, "config.yml"), @config_hash.to_yaml)

    # Mock session update
    session.expects(:update!).with(
      status: "active",
      tmux_session: "claude-swarm-#{session.session_id}",
      launched_at: anything,
    )

    result = launcher.launch_interactive

    assert result
  end

  test "launch_non_interactive delegates to launch_interactive" do
    session = create(:session, :non_interactive, configuration_hash: @config_hash)
    launcher = SwarmLauncher.new(session)

    # Mock directory creation
    FileUtils.expects(:mkdir_p).with(session.session_path).returns(true)

    # Mock config file writing
    File.expects(:write).with(File.join(session.session_path, "config.yml"), @config_hash.to_yaml)

    # Mock session update
    session.expects(:update!).with(
      status: "active",
      tmux_session: "claude-swarm-#{session.session_id}",
      launched_at: anything,
    )

    result = launcher.launch_non_interactive

    assert result
  end

  test "handles launch error gracefully" do
    session = create(:session, configuration_hash: @config_hash, working_directory: "/home/user/project")
    launcher = SwarmLauncher.new(session)

    # Mock directory creation failure
    FileUtils.expects(:mkdir_p).with(session.session_path).raises(StandardError, "Failed to create directory")

    # Mock session update for error
    session.expects(:update!).with(status: "error")

    result = launcher.launch_interactive

    assert_not result
  end

  test "write_config_file creates config with correct content" do
    session = create(:session, configuration_hash: @config_hash)
    launcher = SwarmLauncher.new(session)

    FileUtils.expects(:mkdir_p).with(session.session_path).returns(true)

    expected_path = File.join(session.session_path, "config.yml")
    File.expects(:write).with(expected_path, @config_hash.to_yaml)

    path = launcher.send(:write_config_file)
    assert_equal expected_path, path
  end

  test "build_command generates correct command" do
    session = create(:session, configuration_hash: @config_hash)
    launcher = SwarmLauncher.new(session)
    config_path = "/tmp/config.yml"

    command = launcher.send(:build_command, config_path)

    expected = [
      "claude-swarm",
      "--worktree-directory",
      session.worktree_path,
      "--config",
      config_path,
      "--start-directory",
      session.working_directory,
    ]

    assert_equal expected, command
  end

  test "uses current directory when working_directory is nil" do
    session = create(:session, configuration_hash: @config_hash, working_directory: nil)
    launcher = SwarmLauncher.new(session)

    # Mock directory creation
    FileUtils.expects(:mkdir_p).with(session.session_path).returns(true)
    
    # Mock config file writing
    File.expects(:write).with(File.join(session.session_path, "config.yml"), @config_hash.to_yaml)

    # Mock session update
    session.expects(:update!).with(
      status: "active",
      tmux_session: "claude-swarm-#{session.session_id}",
      launched_at: anything,
    )

    result = launcher.launch_interactive
    assert result
  end
end
