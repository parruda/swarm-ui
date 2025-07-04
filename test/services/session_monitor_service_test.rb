# frozen_string_literal: true

require "test_helper"

class SessionMonitorServiceTest < ActiveSupport::TestCase
  setup do
    @session_path = "/tmp/test_session"
    @log_path = File.join(@session_path, "session.log.json")
    @monitor = SessionMonitorService.new(@session_path)
  end

  test "calculate_costs returns empty hash when log file doesn't exist" do
    # Mock File.exist? to handle any path
    File.stubs(:exist?).returns(false)
    
    result = @monitor.calculate_costs

    assert_equal({}, result)
  end

  test "calculate_costs aggregates costs by instance" do
    log_entries = [
      {
        timestamp: "2024-01-15T10:00:00Z",
        instance: "main",
        event: { type: "result", total_cost: 0.05 }
      }.to_json,
      {
        timestamp: "2024-01-15T10:01:00Z",
        instance: "main",
        event: { type: "result", total_cost: 0.03 }
      }.to_json,
      {
        timestamp: "2024-01-15T10:02:00Z",
        instance: "helper",
        event: { type: "result", total_cost: 0.02 }
      }.to_json,
      {
        timestamp: "2024-01-15T10:03:00Z",
        instance: "main",
        event: { type: "message" } # No cost
      }.to_json
    ]

    # Mock File.exist? and File.foreach
    File.stubs(:exist?).returns(true)
    File.stubs(:foreach).with(@log_path).multiple_yields(*log_entries.map { |e| [e] })

    result = @monitor.calculate_costs

    assert_equal 0.08, result["main"]
    assert_equal 0.02, result["helper"]
  end

  test "calculate_costs handles malformed log entries" do
    log_entries = [
      { instance: "main", event: { type: "result", total_cost: 0.05 } }.to_json,
      "invalid json",
      { instance: "main", event: { type: "result", total_cost: 0.03 } }.to_json
    ]

    # Mock File.exist? and File.foreach
    File.stubs(:exist?).returns(true)
    File.stubs(:foreach).with(@log_path).multiple_yields(*log_entries.map { |e| [e] })

    result = @monitor.calculate_costs

    assert_equal 0.08, result["main"]
  end

  test "active? returns true when processes are running" do
    pids_dir = File.join(@session_path, "pids")
    pid_files = ["#{pids_dir}/12345", "#{pids_dir}/12346"]

    Dir.expects(:exist?).with(pids_dir).returns(true)
    Dir.expects(:glob).with(File.join(pids_dir, "*")).returns(pid_files)

    # First PID is running
    Process.expects(:kill).with(0, 12345).returns(1)

    result = @monitor.active?

    assert result
  end

  test "active? returns false when no processes are running" do
    pids_dir = File.join(@session_path, "pids")
    pid_files = ["#{pids_dir}/12345"]

    Dir.expects(:exist?).with(pids_dir).returns(true)
    Dir.expects(:glob).with(File.join(pids_dir, "*")).returns(pid_files)

    # Process not found
    Process.expects(:kill).with(0, 12345).raises(Errno::ESRCH)

    # Check run symlink
    run_dir = File.expand_path("~/.claude-swarm/run")
    session_id = File.basename(@session_path)
    symlink_path = File.join(run_dir, session_id)
    
    File.expects(:symlink?).with(symlink_path).returns(false)

    result = @monitor.active?

    assert_not result
  end

  test "active? checks run symlink when no pids directory" do
    pids_dir = File.join(@session_path, "pids")
    Dir.expects(:exist?).with(pids_dir).returns(false)

    run_dir = File.expand_path("~/.claude-swarm/run")
    session_id = File.basename(@session_path)
    symlink_path = File.join(run_dir, session_id)
    
    File.expects(:symlink?).with(symlink_path).returns(true)
    File.expects(:readlink).with(symlink_path).returns(@session_path)

    result = @monitor.active?

    assert result
  end

  test "instance_hierarchy parses MCP files and config" do
    config_file = File.join(@session_path, "config.yml")
    config_data = { "swarm" => { "main" => "coordinator" } }
    
    mcp_files = [
      File.join(@session_path, "coordinator.mcp.json"),
      File.join(@session_path, "worker.mcp.json")
    ]

    # Mock costs calculation
    @monitor.expects(:calculate_costs).returns({
      "coordinator" => 0.10,
      "worker" => 0.05
    })

    # Mock all File.exist? calls to return true
    File.stubs(:exist?).returns(true)
    
    # Mock file reads
    File.stubs(:read).with(config_file).returns(config_data.to_yaml)

    # Mock MCP files
    Dir.stubs(:glob).returns(mcp_files)

    # Mock coordinator MCP
    File.stubs(:read).with(mcp_files[0]).returns({
      mcpServers: { "worker" => {}, "helper" => {} }
    }.to_json)

    # Mock worker MCP
    File.stubs(:read).with(mcp_files[1]).returns({
      mcpServers: {}
    }.to_json)

    # Mock state files - they exist and have instance data
    state_files = {
      File.join(@session_path, "state", "coordinator.json") => {
        instance_id: "coord-123",
        claude_session_id: "session-456"
      },
      File.join(@session_path, "state", "worker.json") => {
        instance_id: "worker-789",
        claude_session_id: "session-012"
      }
    }
    
    state_files.each do |path, data|
      File.stubs(:read).with(path).returns(data.to_json)
    end

    result = @monitor.instance_hierarchy

    assert_not_nil result, "instance_hierarchy should not return nil"
    assert_not_empty result, "instance_hierarchy should not be empty"
    assert result.key?("coordinator"), "Result should have coordinator key"
    assert_equal true, result["coordinator"][:is_main]
    assert_equal ["worker", "helper"], result["coordinator"][:connections]
    assert_equal 0.10, result["coordinator"][:costs]
    
    assert_equal false, result["worker"][:is_main]
    assert_equal [], result["worker"][:connections]
    assert_equal 0.05, result["worker"][:costs]
  end

  test "stream_events can parse log entries" do
    # Since stream_events has an infinite loop that's hard to test,
    # we'll just verify the basic file handling works
    
    # Mock File.exist?
    File.stubs(:exist?).returns(true)
    
    # Mock file operations
    mock_file = mock()
    mock_file.expects(:seek).with(0, IO::SEEK_END)
    
    File.expects(:open).with(@log_path, "r").yields(mock_file)
    
    # We expect the method to enter its loop
    called = false
    @monitor.define_singleton_method(:loop) do
      called = true
      # Don't actually loop
    end
    
    @monitor.stream_events { |event| }

    assert called, "stream_events should enter its loop"
  end
end