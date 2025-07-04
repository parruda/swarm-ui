require "test_helper"

class SessionTest < ActiveSupport::TestCase
  # Test validations
  test "should be valid with valid attributes" do
    session = build(:session)
    assert session.valid?
  end
  
  test "should require session_id" do
    session = build(:session, session_id: nil)
    assert_not session.valid?
    assert_includes session.errors[:session_id], "can't be blank"
  end
  
  test "should require unique session_id" do
    existing_session = create(:session)
    duplicate_session = build(:session, session_id: existing_session.session_id)
    assert_not duplicate_session.valid?
    assert_includes duplicate_session.errors[:session_id], "has already been taken"
  end
  
  # Test associations
  test "belongs to swarm_configuration optionally" do
    session = create(:session, swarm_configuration: nil)
    assert session.valid?
    assert_nil session.swarm_configuration
  end
  
  test "can have a swarm_configuration" do
    config = create(:swarm_configuration)
    session = create(:session, swarm_configuration: config)
    assert_equal config, session.swarm_configuration
  end
  
  # Test scopes
  test "active scope returns sessions with active status" do
    active_session = create(:session, status: 'active')
    completed_session = create(:session, status: 'completed')
    
    active_sessions = Session.active
    assert_includes active_sessions, active_session
    assert_not_includes active_sessions, completed_session
  end
  
  test "completed scope returns sessions with completed status" do
    active_session = create(:session, status: 'active')
    completed_session = create(:session, status: 'completed')
    
    completed_sessions = Session.completed
    assert_includes completed_sessions, completed_session
    assert_not_includes completed_sessions, active_session
  end
  
  # Test active? method
  test "active? returns true for interactive session with existing tmux session" do
    session = build(:session, mode: 'interactive', tmux_session: 'test-session')
    
    # Mock the system call to return true (tmux session exists)
    session.stub :system, true do
      assert session.active?
    end
  end
  
  test "active? returns false for interactive session without tmux session" do
    session = build(:session, mode: 'interactive', tmux_session: nil)
    assert_not session.active?
  end
  
  test "active? returns false for interactive session with non-existent tmux session" do
    session = build(:session, mode: 'interactive', tmux_session: 'test-session')
    
    # Mock the system call to return false (tmux session doesn't exist)
    session.stub :system, false do
      assert_not session.active?
    end
  end
  
  test "active? returns true for non-interactive session with running process" do
    session = build(:session, :non_interactive, pid: Process.pid)
    
    # Since we're using the current process PID, it should be alive
    assert session.active?
  end
  
  test "active? returns false for non-interactive session with non-existent process" do
    session = build(:session, :non_interactive, pid: 99999999)
    
    # This PID shouldn't exist
    assert_not session.active?
  end
  
  test "active? returns false for non-interactive session without pid" do
    session = build(:session, :non_interactive, pid: nil)
    assert_not session.active?
  end
  
  # Test logs method
  test "logs method calls SessionLogReader with session_path" do
    session = create(:session)
    mock_reader = Minitest::Mock.new
    mock_reader.expect :read_logs, ["log line 1", "log line 2"]
    
    SessionLogReader.stub :new, mock_reader do
      logs = session.logs
      assert_equal ["log line 1", "log line 2"], logs
    end
    
    mock_reader.verify
  end
  
  # Test swarm_name method
  test "swarm_name returns attribute value if present" do
    session = create(:session, swarm_name: "My Swarm")
    assert_equal "My Swarm", session.swarm_name
  end
  
  test "swarm_name reads from metadata if attribute is nil" do
    # Create session with test-specific path
    temp_path = Rails.root.join("tmp", "test_sessions", "test_#{Time.now.to_f}_#{rand(1000)}")
    session = create(:session, session_path: temp_path.to_s)
    
    # Force swarm_name to be nil in the database
    session.update_column(:swarm_name, nil)
    
    metadata_file = File.join(session.session_path, "session_metadata.json")
    
    # Create temp directory and metadata file
    FileUtils.mkdir_p(session.session_path)
    File.write(metadata_file, JSON.generate({ "swarm_name" => "Metadata Swarm" }))
    
    # Reload to clear memoization
    session.reload
    assert_equal "Metadata Swarm", session.swarm_name
    
    # Cleanup
    FileUtils.rm_rf(session.session_path)
  end
  
  test "swarm_name returns nil if no metadata file exists" do
    session = create(:session)
    session.update_column(:swarm_name, nil)
    session.reload
    assert_nil session.swarm_name
  end
  
  # Test private methods indirectly
  test "read_session_metadata returns empty hash if file doesn't exist" do
    session = create(:session)
    # The method is private, but we can test its effect through swarm_name
    session.update_column(:swarm_name, nil)
    assert_nil session.swarm_name
  end
  
  test "read_session_metadata parses JSON correctly" do
    # Create session with test-specific path
    temp_path = Rails.root.join("tmp", "test_sessions", "test_#{Time.now.to_f}_#{rand(1000)}")
    session = create(:session, session_path: temp_path.to_s)
    session.update_column(:swarm_name, nil)
    
    metadata_file = File.join(session.session_path, "session_metadata.json")
    
    FileUtils.mkdir_p(session.session_path)
    File.write(metadata_file, JSON.generate({ 
      "swarm_name" => "Test Swarm",
      "other_key" => "other_value"
    }))
    
    session.reload
    assert_equal "Test Swarm", session.swarm_name
    
    FileUtils.rm_rf(session.session_path)
  end
end