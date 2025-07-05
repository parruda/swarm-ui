require "test_helper"

class TerminalsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @interactive_session = create(:session, 
      mode: 'interactive', 
      tmux_session: 'claude-swarm-20250104_120000'
    )
    @non_interactive_session = create(:session, :non_interactive)
  end

  test "should show terminal for interactive session with tmux" do
    # Mock tmux session exists
    TerminalsController.any_instance.expects(:system).with("tmux has-session -t claude-swarm-20250104_120000 2>/dev/null").returns(true)
    # Mock the session's active? method
    Session.any_instance.stubs(:active?).returns(true)
    
    get session_terminal_url(@interactive_session.session_id)
    assert_response :success
    assert_not_nil assigns(:terminal_config)
    
    config = assigns(:terminal_config)
    assert_equal @interactive_session.session_id, config[:session_id]
    assert_equal 'claude-swarm-20250104_120000', config[:tmux_session]
    assert config[:active]
  end

  test "should redirect non-interactive session to session page" do
    get session_terminal_url(@non_interactive_session.session_id)
    
    assert_redirected_to session_path(@non_interactive_session.session_id)
    assert_equal 'Terminal is only available for interactive sessions.', flash[:alert]
  end

  test "should redirect when tmux session does not exist" do
    # Mock tmux session doesn't exist
    TerminalsController.any_instance.expects(:system).with("tmux has-session -t claude-swarm-20250104_120000 2>/dev/null").returns(false)
    
    get session_terminal_url(@interactive_session.session_id)
    
    assert_redirected_to session_path(@interactive_session.session_id)
    assert_equal 'Tmux session no longer exists.', flash[:alert]
  end

  test "should redirect when no tmux session associated" do
    @interactive_session.update!(tmux_session: nil)
    
    get session_terminal_url(@interactive_session.session_id)
    
    assert_redirected_to session_path(@interactive_session.session_id)
    assert_equal 'No tmux session associated with this session.', flash[:alert]
  end

  test "should handle session not found" do
    assert_raises(ActiveRecord::RecordNotFound) do
      get session_terminal_url("nonexistent")
    end
  end

  test "should pass correct terminal config to view" do
    # Mock tmux session exists and session is active
    TerminalsController.any_instance.expects(:system).with("tmux has-session -t claude-swarm-20250104_120000 2>/dev/null").returns(true)
    Session.any_instance.stubs(:active?).returns(true)
    
    get session_terminal_url(@interactive_session.session_id)
    assert_response :success
    
    config = assigns(:terminal_config)
    assert_kind_of Hash, config
    assert config.key?(:session_id)
    assert config.key?(:tmux_session)
    assert config.key?(:active)
  end

  test "should verify session mode before checking tmux" do
    # For non-interactive sessions, tmux check should not be called
    TerminalsController.any_instance.expects(:system).never
    
    get session_terminal_url(@non_interactive_session.session_id)
    
    assert_redirected_to session_path(@non_interactive_session.session_id)
  end

  test "should handle empty tmux session name" do
    @interactive_session.update!(tmux_session: '')
    
    get session_terminal_url(@interactive_session.session_id)
    
    assert_redirected_to session_path(@interactive_session.session_id)
    assert_equal 'No tmux session associated with this session.', flash[:alert]
  end

  test "should check active status of session" do
    # Mock tmux exists and session active check
    TerminalsController.any_instance.expects(:system).with("tmux has-session -t claude-swarm-20250104_120000 2>/dev/null").returns(true)
    Session.any_instance.expects(:active?).returns(false)
    
    get session_terminal_url(@interactive_session.session_id)
    assert_response :success
    
    config = assigns(:terminal_config)
    assert_not config[:active]
  end
end