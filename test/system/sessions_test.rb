require "application_system_test_case"

class SessionsTest < ApplicationSystemTestCase
  setup do
    @swarm_configuration = create(:swarm_configuration, name: "Test Swarm Config")
    @directory = create(:directory, path: "/tmp/test_project", name: "Test Project")
    
    # Create test directory
    FileUtils.mkdir_p("/tmp/test_project")
    File.write("/tmp/test_project/claude-swarm.yml", "swarm:\n  name: Test")
    
    # Mock SwarmLauncher to avoid actual launches
    SwarmLauncher.any_instance.stubs(:launch).returns("20250104_120000")
    SwarmLauncher.any_instance.stubs(:tmux_available?).returns(true)
    
    # Create a mock session for the launched session
    @launched_session = create(:session, 
      session_id: "20250104_120000",
      swarm_name: "Test Swarm",
      mode: "interactive",
      status: "active"
    )
  end

  teardown do
    FileUtils.rm_rf("/tmp/test_project")
  end

  test "visiting the index" do
    visit sessions_url
    
    assert_selector "h1", text: "Sessions"
    assert_text @launched_session.swarm_name
    assert_text @launched_session.session_id
  end

  test "creating a session with saved configuration" do
    visit sessions_url
    click_on "New Session"
    
    # Fill in directory
    fill_in "Working Directory", with: "/tmp/test_project"
    
    # Select saved configuration
    choose "Use saved configuration"
    select "Test Swarm Config", from: "Saved Configuration"
    
    # Select interactive mode
    choose "Interactive Mode"
    
    # Launch
    click_on "Launch Swarm"
    
    assert_current_path session_path("20250104_120000")
    assert_text "Test Swarm"
  end

  test "creating a non-interactive session with prompt" do
    visit new_session_url
    
    fill_in "Working Directory", with: "/tmp/test_project"
    choose "Use saved configuration"
    select "Test Swarm Config", from: "Saved Configuration"
    
    # Select non-interactive mode
    choose "Non-Interactive Mode"
    
    # Prompt field should appear
    assert_selector "#prompt-field", visible: true
    fill_in "Prompt", with: "Analyze the codebase and summarize the main components"
    
    click_on "Launch Swarm"
    
    assert_current_path session_path("20250104_120000")
  end

  test "creating a session with config file from repository" do
    visit new_session_url(directory_path: "/tmp/test_project")
    
    fill_in "Working Directory", with: "/tmp/test_project"
    
    # Select file configuration
    choose "Use configuration file from repository"
    select "claude-swarm.yml", from: "Configuration File"
    
    choose "Interactive Mode"
    
    # Check worktree option
    check "Create in Git worktree"
    
    click_on "Launch Swarm"
    
    assert_current_path session_path("20250104_120000")
  end

  test "handling launch errors" do
    # Make SwarmLauncher raise an error
    SwarmLauncher.any_instance.unstub(:launch)
    SwarmLauncher.any_instance.stubs(:launch).raises(StandardError.new("Launch failed: tmux not available"))
    
    visit new_session_url
    
    fill_in "Working Directory", with: "/tmp/test_project"
    choose "Use saved configuration"
    select "Test Swarm Config", from: "Saved Configuration"
    
    click_on "Launch Swarm"
    
    assert_current_path new_session_path
    assert_text "Launch failed: tmux not available"
  end

  test "session details page shows correct information" do
    # Mock SessionMonitorService
    mock_monitor = mock()
    mock_monitor.stubs(:calculate_costs).returns({ 'leader' => 0.05, 'frontend' => 0.03 })
    mock_monitor.stubs(:instance_hierarchy).returns({
      'leader' => { is_main: true, connections: ['frontend'], costs: 0.05 },
      'frontend' => { is_main: false, connections: [], costs: 0.03 }
    })
    mock_monitor.stubs(:active?).returns(true)
    SessionMonitorService.stubs(:new).returns(mock_monitor)
    
    visit session_url(@launched_session.session_id)
    
    assert_text "Test Swarm"
    assert_text "Session: 20250104_120000"
    assert_text "Total Cost: $0.08"
    assert_text "Active"
    
    # Should have action buttons
    assert_link "View Logs"
    assert_button "Stop Session"
    
    # For interactive session, should have terminal link
    assert_link "Open Terminal"
  end

  test "stopping a session" do
    TerminalAttachmentService.any_instance.stubs(:kill_session)
    
    visit session_url(@launched_session.session_id)
    
    accept_confirm do
      click_button "Stop Session"
    end
    
    assert_current_path sessions_path
    
    @launched_session.reload
    assert_equal 'terminated', @launched_session.status
  end

  test "session restoration page" do
    # Mock session discovery
    SessionDiscoveryService.stubs(:list_all_sessions).returns([
      {
        session_id: "20250103_100000",
        session_path: "/path/to/session",
        swarm_name: "Old Swarm",
        start_time: 1.day.ago
      }
    ])
    
    # Mock monitor
    SessionMonitorService.any_instance.stubs(:active?).returns(false)
    
    visit restore_sessions_url
    
    assert_text "Restore Session"
    assert_text "20250103_100000"
    assert_text "Old Swarm"
    
    # Should have restore button
    assert_button "Restore"
  end

  test "restoring an interactive session" do
    # Mock find_session_path
    SessionsController.any_instance.stubs(:find_session_path).returns("/path/to/session")
    
    # Mock system call for tmux
    Kernel.stubs(:system).returns(true)
    
    # Mock file existence for metadata
    File.stubs(:exist?).with("/path/to/session/session_metadata.json").returns(true)
    File.stubs(:read).with("/path/to/session/session_metadata.json").returns({
      mode: "interactive"
    }.to_json)
    
    visit restore_sessions_url
    
    # Click restore for a specific session
    within("#session_20250103_100000") do
      click_button "Restore"
    end
    
    assert_current_path session_path("20250103_100000")
  end

  test "directory selector updates config files" do
    skip "Requires JavaScript for dynamic behavior"
    
    visit new_session_url
    
    # When directory is entered, it should update config files
    fill_in "Working Directory", with: "/tmp/test_project"
    
    # This would trigger AJAX in real browser
    # assert_select "Configuration File", options: ["claude-swarm.yml"]
  end

  test "mode selector shows/hides prompt field" do
    skip "Requires JavaScript for dynamic behavior"
    
    visit new_session_url
    
    # Initially prompt field should be hidden
    assert_selector "#prompt-field", visible: false
    
    # Select non-interactive mode
    choose "Non-Interactive Mode"
    
    # Prompt field should appear
    assert_selector "#prompt-field", visible: true
    
    # Switch back to interactive
    choose "Interactive Mode"
    
    # Prompt field should hide
    assert_selector "#prompt-field", visible: false
  end

  test "viewing output for non-interactive session" do
    non_interactive = create(:session, 
      mode: 'non-interactive',
      output_file: '/tmp/output.log'
    )
    
    File.write('/tmp/output.log', "Task completed successfully\nProcessed 5 files")
    
    visit session_url(non_interactive.session_id)
    
    # Should show output viewer instead of terminal link
    assert_no_link "Open Terminal"
    assert_selector ".output-viewer"
    
    click_link "View Output"
    
    assert_text "Task completed successfully"
    assert_text "Processed 5 files"
  ensure
    FileUtils.rm_f('/tmp/output.log')
  end

  test "session list shows both active and inactive sessions" do
    active_session = create(:session, status: 'active', swarm_name: "Active Swarm")
    inactive_session = create(:session, status: 'inactive', swarm_name: "Inactive Swarm")
    
    # Mock discovery
    SessionDiscoveryService.stubs(:active_sessions).returns([])
    
    visit sessions_url
    
    assert_text "Active Swarm"
    assert_text "Inactive Swarm"
    
    # Active sessions should have different styling
    within("#session_#{active_session.session_id}") do
      assert_selector ".status-active"
    end
    
    within("#session_#{inactive_session.session_id}") do
      assert_selector ".status-inactive"
    end
  end
end