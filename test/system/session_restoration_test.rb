require "application_system_test_case"

class SessionRestorationTest < ApplicationSystemTestCase
  setup do
    # Mock session discovery
    @discovered_sessions = [
      {
        session_id: "20250104_100000",
        session_path: "/path/to/session1",
        swarm_name: "Test Swarm 1",
        mode: "interactive",
        start_time: 2.hours.ago,
        status: "inactive"
      },
      {
        session_id: "20250104_110000", 
        session_path: "/path/to/session2",
        swarm_name: "Test Swarm 2",
        mode: "non-interactive",
        start_time: 1.hour.ago,
        status: "completed"
      }
    ]
    
    SessionDiscoveryService.stubs(:list_all_sessions).returns(@discovered_sessions)
    
    # Mock monitor service
    mock_monitor = mock()
    mock_monitor.stubs(:active?).returns(false)
    SessionMonitorService.stubs(:new).returns(mock_monitor)
  end

  test "viewing restorable sessions" do
    visit restore_sessions_path
    
    assert_text "Restore Session"
    assert_text "Found 2 sessions that can be restored"
    
    # Should show session details
    within "#restorable-sessions" do
      # First session
      assert_text "20250104_100000"
      assert_text "Test Swarm 1"
      assert_text "Interactive"
      assert_selector "button", text: "Restore"
      
      # Second session  
      assert_text "20250104_110000"
      assert_text "Test Swarm 2"
      assert_text "Non-interactive"
      assert_text "Cannot restore non-interactive sessions"
    end
  end

  test "restoring an interactive session" do
    # Mock the restoration process
    SessionsController.any_instance.stubs(:find_session_path).returns("/path/to/session1")
    SessionsController.any_instance.stubs(:system).returns(true)
    
    visit restore_sessions_path
    
    # Click restore on the first session
    within "#session-20250104_100000" do
      click_button "Restore"
    end
    
    # Should redirect to the restored session
    assert_current_path session_path("20250104_100000")
    assert_text "Session restored successfully"
    
    # Should have created a session record
    session = Session.find_by(session_id: "20250104_100000")
    assert session.present?
    assert_equal "active", session.status
    assert_equal "interactive", session.mode
  end

  test "handling restoration failure" do
    # Mock restoration failure
    SessionsController.any_instance.stubs(:find_session_path).returns("/path/to/session1")
    SessionsController.any_instance.stubs(:system).returns(false)
    
    visit restore_sessions_path
    
    within "#session-20250104_100000" do
      click_button "Restore"
    end
    
    # Should stay on restore page with error
    assert_current_path restore_sessions_path
    assert_text "Failed to restore session"
  end

  test "filtering restorable sessions" do
    # Add more sessions for filtering
    many_sessions = (1..10).map do |i|
      {
        session_id: "20250104_#{120000 + i * 1000}",
        session_path: "/path/to/session#{i}",
        swarm_name: i.even? ? "Production Swarm #{i}" : "Development Swarm #{i}",
        mode: "interactive",
        start_time: i.hours.ago,
        status: "inactive"
      }
    end
    
    SessionDiscoveryService.stubs(:list_all_sessions).returns(many_sessions)
    
    visit restore_sessions_path
    
    # Should have search/filter functionality
    assert_selector "input[type='search']", visible: true
    
    fill_in "Search sessions", with: "Production"
    
    # Should only show production swarms
    assert_text "Production Swarm 2"
    assert_text "Production Swarm 4"
    assert_no_text "Development Swarm 1"
  end

  test "showing session metadata details" do
    # Mock detailed metadata
    metadata = {
      "session_id" => "20250104_100000",
      "swarm_name" => "Test Swarm 1",
      "start_time" => 2.hours.ago.iso8601,
      "start_directory" => "/home/user/project",
      "worktree" => "/tmp/worktree-123",
      "mode" => "interactive",
      "configuration" => {
        "version" => 1,
        "swarm" => {
          "name" => "Test Swarm 1",
          "instances" => ["lead", "assistant"]
        }
      }
    }
    
    File.stubs(:exist?).returns(true)
    File.stubs(:read).returns(metadata.to_json)
    
    visit restore_sessions_path
    
    # Click to show details
    within "#session-20250104_100000" do
      click_button "Show Details"
    end
    
    # Should show expanded metadata
    within "#session-20250104_100000-details" do
      assert_text "Start Directory: /home/user/project"
      assert_text "Worktree: /tmp/worktree-123"
      assert_text "Instances: lead, assistant"
    end
  end

  test "no sessions to restore message" do
    SessionDiscoveryService.stubs(:list_all_sessions).returns([])
    
    visit restore_sessions_path
    
    assert_text "No sessions found to restore"
    assert_selector "a", text: "Create New Session"
  end

  test "already restored sessions marked appropriately" do
    # Create an existing session that matches discovered one
    create(:session, session_id: "20250104_100000", status: "active")
    
    visit restore_sessions_path
    
    within "#session-20250104_100000" do
      assert_text "Already Restored"
      assert_no_selector "button", text: "Restore"
    end
  end
end