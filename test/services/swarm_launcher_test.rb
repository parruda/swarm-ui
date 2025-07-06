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

  test "launch_interactive creates tmux session and runs claude-swarm" do
    session = create(:session, configuration_hash: @config_hash, working_directory: "/home/user/project")
    launcher = SwarmLauncher.new(session)

    # Mock tmux session creation with working directory, size and bash
    launcher.expects(:system).with("tmux", "new-session", "-d", "-s", "claude-swarm-#{session.session_id}", "-c", "/home/user/project", "-x", "400", "-y", "100", "bash").returns(true)

    # Mock directory creation
    FileUtils.expects(:mkdir_p).with(session.session_path).returns(true)

    # Mock config file writing
    File.expects(:write).with(File.join(session.session_path, "config.yml"), @config_hash.to_yaml)

    # Mock session update (no tmux commands expected)
    session.expects(:update!).with(
      status: "active",
      tmux_session: "claude-swarm-#{session.session_id}",
      launched_at: anything,
    )

    result = launcher.launch_interactive

    assert result
  end

  test "launch_non_interactive runs claude-swarm in background" do
    session = create(:session, :non_interactive, configuration_hash: @config_hash)
    launcher = SwarmLauncher.new(session)

    # Mock directory creation
    FileUtils.expects(:mkdir_p).with(session.session_path).returns(true)

    # Mock config file writing
    File.expects(:write).with(File.join(session.session_path, "config.yml"), @config_hash.to_yaml)

    # Mock output file creation
    output_file = File.join(session.session_path, "output.log")
    mock_file = mock
    File.expects(:open).with(output_file, "w").yields(mock_file)

    # Mock spawn
    spawn_command = [
      "claude-swarm",
      "--worktree-directory",
      session.worktree_path,
      "--config",
      File.join(session.session_path, "config.yml"),
      "--start-directory",
      session.working_directory,
    ]
    launcher.expects(:spawn).with(*spawn_command, out: mock_file, err: mock_file).returns(12345)

    # Mock Process.detach
    Process.expects(:detach).with(12345)

    # Mock session update
    session.expects(:update!).with(
      status: "active",
      pid: 12345,
      output_file: output_file,
      launched_at: anything,
    )

    # Mock background job
    MonitorNonInteractiveSessionJob.expects(:perform_later).with(session)

    result = launcher.launch_non_interactive

    assert result
  end

  test "handles launch error gracefully" do
    session = create(:session, configuration_hash: @config_hash, working_directory: "/home/user/project")
    launcher = SwarmLauncher.new(session)

    # Mock tmux session creation failure
    launcher.expects(:system).with("tmux", "new-session", "-d", "-s", "claude-swarm-#{session.session_id}", "-c", "/home/user/project", "-x", "400", "-y", "100", "bash").returns(false)

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
    ENV["SHELL"] || "/bin/sh"

    # Should use Dir.pwd as fallback
    launcher.expects(:system).with("tmux", "new-session", "-d", "-s", "claude-swarm-#{session.session_id}", "-c", Dir.pwd, "-x", "400", "-y", "100", "bash").returns(true)

    FileUtils.expects(:mkdir_p).with(session.session_path).returns(true)
    File.expects(:write).with(File.join(session.session_path, "config.yml"), @config_hash.to_yaml)

    # Mock session update (no tmux commands expected)
    session.expects(:update!).with(
      status: "active",
      tmux_session: "claude-swarm-#{session.session_id}",
      launched_at: anything,
    )

    result = launcher.launch_interactive
    assert result
  end
end
