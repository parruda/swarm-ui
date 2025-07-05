# frozen_string_literal: true

require "test_helper"

class SessionDiscoveryServiceTest < ActiveSupport::TestCase
  setup do
    @sessions_dir = File.expand_path("~/.claude-swarm/sessions")
    @run_dir = File.expand_path("~/.claude-swarm/run")
    @sample_metadata = {
      "swarm_name" => "test-swarm",
      "start_time" => "2024-01-15T10:00:00Z",
      "worktree" => "/tmp/worktree",
      "start_directory" => "/home/user/project"
    }
  end

  test "list_all_sessions returns empty array when directory doesn't exist" do
    Dir.expects(:exist?).with(@sessions_dir).returns(false)

    result = SessionDiscoveryService.list_all_sessions

    assert_equal [], result
  end

  test "list_all_sessions returns sessions from filesystem" do
    Dir.expects(:exist?).with(@sessions_dir).returns(true)
    
    # Mock directory structure
    session_paths = [
      "#{@sessions_dir}/project1/20240115_100000",
      "#{@sessions_dir}/project1/20240115_110000",
      "#{@sessions_dir}/project2/20240115_120000"
    ]
    
    Dir.expects(:glob).with("#{@sessions_dir}/*/*").returns(session_paths)

    # Mock directory and file checks
    session_paths.each do |path|
      File.stubs(:directory?).with(path).returns(true)
      metadata_path = File.join(path, "session_metadata.json")
      # With Pathname stub in place, we can use anything matcher
      File.stubs(:exist?).with(anything).returns(true)
    end

    # Mock metadata reading
    session_paths.each do |path|
      File.expects(:read).with(File.join(path, "session_metadata.json")).returns(@sample_metadata.to_json)
    end

    result = SessionDiscoveryService.list_all_sessions

    assert_equal 3, result.length
    assert result.all? { |s| s[:session_id].present? }
    assert result.all? { |s| s[:swarm_name] == "test-swarm" }
  end

  test "list_all_sessions respects limit parameter" do
    Dir.expects(:exist?).with(@sessions_dir).returns(true)
    
    session_paths = (1..5).map { |i| "#{@sessions_dir}/project/2024011#{i}_100000" }
    Dir.expects(:glob).with("#{@sessions_dir}/*/*").returns(session_paths)

    session_paths.each do |path|
      File.stubs(:directory?).with(path).returns(true)
      # With Pathname stub in place, we can use anything matcher
      File.stubs(:exist?).with(anything).returns(true)
      File.expects(:read).with(File.join(path, "session_metadata.json")).returns(@sample_metadata.to_json)
    end

    result = SessionDiscoveryService.list_all_sessions(limit: 3)

    assert_equal 3, result.length
  end

  test "active_sessions returns sessions from run directory" do
    File.stubs(:directory?).with(@run_dir).returns(true)

    # Mock symlinks in run directory
    symlinks = [
      "#{@run_dir}/20240115_100000",
      "#{@run_dir}/20240115_110000"
    ]
    
    Dir.expects(:glob).with(File.join(@run_dir, "*")).returns(symlinks)

    # Mock symlink checks and targets
    symlinks.each_with_index do |symlink, index|
      File.expects(:symlink?).with(symlink).returns(true)
      target = "#{@sessions_dir}/project#{index}/#{File.basename(symlink)}"
      File.expects(:readlink).with(symlink).returns(target)
      # With Pathname stub in place, we can use anything matcher
      File.stubs(:exist?).with(anything).returns(true)
      File.expects(:read).with(File.join(target, "session_metadata.json")).returns(@sample_metadata.to_json)
    end

    result = SessionDiscoveryService.active_sessions

    assert_equal 2, result.length
    assert result.all? { |s| s[:active] == true }
  end

  test "active_sessions handles missing run directory" do
    File.stubs(:directory?).with(@run_dir).returns(false)

    result = SessionDiscoveryService.active_sessions

    assert_equal [], result
  end

  test "build_session_info extracts correct information" do
    session_path = "#{@sessions_dir}/my_project/20240115_143000"
    metadata = @sample_metadata.dup

    # Use send to access private method
    result = SessionDiscoveryService.send(:build_session_info, session_path, metadata)

    assert_equal "20240115_143000", result[:session_id]
    assert_equal session_path, result[:session_path]
    assert_equal "my_project", result[:project_name]
    assert_equal "test-swarm", result[:swarm_name]
    assert_equal "/tmp/worktree", result[:worktree]
    assert_equal "/home/user/project", result[:start_directory]
    assert_kind_of Time, result[:start_time]
  end

  test "handles malformed metadata gracefully" do
    Dir.expects(:exist?).with(@sessions_dir).returns(true)
    
    session_path = "#{@sessions_dir}/project/20240115_100000"
    Dir.expects(:glob).with("#{@sessions_dir}/*/*").returns([session_path])
    
    File.stubs(:directory?).with(session_path).returns(true)
    # With Pathname stub in place, we can use anything matcher
    File.stubs(:exist?).with(anything).returns(true)
    
    # Return invalid JSON
    File.expects(:read).with(File.join(session_path, "session_metadata.json")).returns("invalid json")

    Rails.logger.expects(:error).with(regexp_matches(/Failed to load session/))

    result = SessionDiscoveryService.list_all_sessions

    assert_equal [], result
  end
end