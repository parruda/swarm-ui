require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @session = create(:session)
    @swarm_config = create(:swarm_configuration)
    
    # Mock tmux availability
    TmuxManager.any_instance.stubs(:tmux_available?).returns(true)
    
    # Mock the service methods directly instead of stubbing File.expand_path
    @empty_sessions = []
  end

  test "should get index" do
    # Mock session discovery
    SessionDiscoveryService.stubs(:active_sessions).returns([])
    
    get sessions_url
    assert_response :success
    assert_not_nil assigns(:sessions)
  end

  test "should get new" do
    get new_session_url
    assert_response :success
    assert_not_nil assigns(:config_files)
    assert_not_nil assigns(:saved_configurations)
    assert_not_nil assigns(:directories)
  end

  test "should create session with interactive mode" do
    # Mock SwarmLauncher
    mock_launcher = mock()
    mock_launcher.expects(:launch).returns("20250104_120000")
    SwarmLauncher.expects(:new).with(has_entries(
      'mode' => 'interactive',
      'directory_path' => '/tmp/test',
      'configuration_source' => 'saved',
      'swarm_configuration_id' => @swarm_config.id.to_s
    )).returns(mock_launcher)
    
    assert_difference('Session.count', 0) do # SwarmLauncher creates the session
      post sessions_url, params: {
        directory_path: '/tmp/test',
        configuration_source: 'saved',
        swarm_configuration_id: @swarm_config.id,
        mode: 'interactive'
      }
    end
    
    assert_redirected_to session_path("20250104_120000")
  end

  test "should create session with non-interactive mode" do
    # Mock SwarmLauncher
    mock_launcher = mock()
    mock_launcher.expects(:launch).returns("20250104_120001")
    SwarmLauncher.expects(:new).with(has_entries(
      'mode' => 'non-interactive',
      'prompt' => 'Test prompt',
      'directory_path' => '/tmp/test',
      'configuration_source' => 'saved',
      'swarm_configuration_id' => @swarm_config.id.to_s
    )).returns(mock_launcher)
    
    post sessions_url, params: {
      directory_path: '/tmp/test',
      configuration_source: 'saved',
      swarm_configuration_id: @swarm_config.id,
      mode: 'non-interactive',
      prompt: 'Test prompt'
    }
    
    assert_redirected_to session_path("20250104_120001")
  end

  test "should handle launch errors gracefully" do
    # Mock SwarmLauncher to raise error
    mock_launcher = mock()
    mock_launcher.expects(:launch).raises(StandardError.new("Launch failed"))
    SwarmLauncher.expects(:new).returns(mock_launcher)
    
    post sessions_url, params: {
      directory_path: '/tmp/test',
      configuration_source: 'saved',
      swarm_configuration_id: @swarm_config.id,
      mode: 'interactive'
    }
    
    assert_redirected_to new_session_path
    assert_equal "Launch failed", flash[:error]
  end

  test "should show session" do
    # Create mock session directory
    session_path = create_mock_session_directory(@session.session_id)
    @session.update!(session_path: session_path)
    
    # Mock monitor service
    mock_monitor = mock()
    mock_monitor.expects(:calculate_costs).returns({ 'leader' => 0.05 })
    mock_monitor.expects(:instance_hierarchy).returns({ 'leader' => { is_main: true } })
    mock_monitor.expects(:active?).returns(true)
    SessionMonitorService.expects(:new).with(session_path).returns(mock_monitor)
    
    get session_url(@session.session_id)
    assert_response :success
    assert_not_nil assigns(:costs)
    assert_not_nil assigns(:instance_hierarchy)
    assert assigns(:active)
    assert_equal 0.05, assigns(:total_cost)
  end

  test "should handle missing session path gracefully" do
    # Mock missing directory
    File.stubs(:directory?).returns(false)
    SessionLogReader.any_instance.stubs(:log_files).returns({})
    SessionLogReader.any_instance.stubs(:parse_instance_hierarchy).returns({})
    SessionMonitorService.any_instance.stubs(:calculate_costs).returns({})
    
    get session_url(@session.session_id)
    assert_response :success
    assert_equal({}, assigns(:costs))
    assert_equal({}, assigns(:instance_hierarchy))
    assert_not assigns(:active)
    assert_equal 0.0, assigns(:total_cost)
  end

  test "should get restore page" do
    # Mock session discovery
    discovered_sessions = [
      {
        session_id: "20250104_100000",
        session_path: "/path/to/session",
        swarm_name: "Test Swarm",
        start_time: Time.now
      }
    ]
    SessionDiscoveryService.expects(:list_all_sessions).with(limit: 50).returns(discovered_sessions)
    
    # Mock monitor service
    mock_monitor = mock()
    mock_monitor.expects(:active?).returns(false)
    SessionMonitorService.expects(:new).with("/path/to/session").returns(mock_monitor)
    
    get restore_sessions_url
    assert_response :success
    assert_not_nil assigns(:sessions)
    assert_equal 1, assigns(:sessions).length
  end

  test "should restore interactive session" do
    session_path = create_mock_session_directory("20250104_100000", mode: "interactive")
    
    # Mock system call for tmux
    tmux_cmd = ["tmux", "new-session", "-d", "-s", "claude-swarm-20250104_100000", "claude-swarm", "--session-id", "20250104_100000"]
    SessionsController.any_instance.expects(:system).with(*tmux_cmd).returns(true)
    
    # Mock find_session_path
    SessionsController.any_instance.stubs(:find_session_path).with("20250104_100000").returns(session_path)
    
    assert_difference('Session.count', 1) do
      post do_restore_sessions_url, params: { session_id: "20250104_100000" }
    end
    
    assert_redirected_to session_path("20250104_100000")
    
    restored_session = Session.find_by(session_id: "20250104_100000")
    assert_equal 'active', restored_session.status
    assert_equal 'interactive', restored_session.mode
    assert_equal "claude-swarm-20250104_100000", restored_session.tmux_session
  end

  test "should handle non-interactive session restoration" do
    session_path = create_mock_session_directory("20250104_100001", mode: "non-interactive")
    
    # Mock find_session_path
    controller.any_instance.stubs(:find_session_path).with("20250104_100001").returns(session_path)
    
    post do_restore_sessions_url, params: { session_id: "20250104_100001" }
    
    assert_redirected_to restore_sessions_path
    assert_equal "Original session was non-interactive. Restoration would require a new prompt.", flash[:alert]
  end

  test "should get logs as JSON" do
    session_path = create_mock_session_directory(@session.session_id)
    @session.update!(session_path: session_path)
    
    # Create mock log entries
    log_entries = [
      create_log_entry("leader", "assistant", { message: { content: "Test message" } })
    ]
    write_jsonl_log(session_path, log_entries)
    
    # Mock LogParserService
    mock_parser = mock()
    mock_parser.expects(:event_timeline).with(start_time: kind_of(Time)).returns([{ event: "test" }])
    LogParserService.expects(:new).with(File.join(session_path, "session.log.json")).returns(mock_parser)
    
    get logs_session_url(@session.session_id)
    assert_response :success
    
    json_response = JSON.parse(response.body)
    assert_kind_of Array, json_response
  end

  test "should get output for non-interactive session" do
    output_file = Rails.root.join('tmp', 'test_output.log')
    FileUtils.mkdir_p(File.dirname(output_file))
    File.write(output_file, "Test output\nLine 2")
    
    @session.update!(mode: 'non-interactive', output_file: output_file.to_s)
    
    get output_session_url(@session.session_id)
    assert_response :success
    assert_equal "Test output\nLine 2", response.body
  ensure
    FileUtils.rm_f(output_file) if output_file
  end

  test "should handle missing output file" do
    @session.update!(mode: 'non-interactive', output_file: nil)
    
    get output_session_url(@session.session_id)
    assert_response :success
    assert_equal "No output available for this session", response.body
  end

  test "should destroy session" do
    # Mock terminal attachment service
    mock_terminal = mock()
    mock_terminal.expects(:kill_session)
    TerminalAttachmentService.expects(:new).with(@session.session_id).returns(mock_terminal)
    
    delete session_url(@session.session_id)
    
    assert_redirected_to sessions_path
    @session.reload
    assert_equal 'terminated', @session.status
  end

  test "should handle session not found" do
    assert_raises(ActiveRecord::RecordNotFound) do
      get session_url("nonexistent")
    end
  end

  test "should find config files in directory" do
    temp_dir = Rails.root.join('tmp', 'test_configs')
    FileUtils.mkdir_p(temp_dir)
    config_file = File.join(temp_dir, 'claude-swarm.yml')
    File.write(config_file, "test: config")
    
    get new_session_url, params: { directory_path: temp_dir.to_s }
    assert_response :success
    
    config_files = assigns(:config_files)
    assert_equal 1, config_files.length
    assert_equal config_file, config_files.first[:path]
  ensure
    FileUtils.rm_rf(temp_dir) if temp_dir
  end

  private

  def controller
    @controller ||= SessionsController
  end
end