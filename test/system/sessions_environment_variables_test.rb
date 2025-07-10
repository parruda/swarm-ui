# frozen_string_literal: true

require "application_system_test_case"

class SessionsEnvironmentVariablesTest < ApplicationSystemTestCase
  setup do
    skip "Skipping until encryption is configured"
    # Create a session with environment variables
    @session = create(:session, 
      swarm_name: "Original Session",
      environment_variables: "API_KEY=secret123\nDEBUG=true\nPORT=3000"
    )
  end

  test "creating a session with environment variables using the new UI" do
    visit new_session_path
    
    fill_in "Session Name", with: "Test Session"
    fill_in "Project Path", with: "/test/project"
    
    # Add environment variables
    click_on "Add Variable"
    within "[data-session-environment-variables-target='container']" do
      inputs = all("input[type='text']")
      inputs[0].fill_in with: "API_KEY"
      inputs[1].fill_in with: "test123"
    end
    
    click_on "Add Variable"
    within "[data-session-environment-variables-target='container']" do
      inputs = all("input[type='text']")
      inputs[2].fill_in with: "DATABASE_URL"
      inputs[3].fill_in with: "postgres://localhost/test"
    end
    
    click_on "Create Session"
    
    # Verify the session was created with the correct environment variables
    session = Session.last
    assert_equal "API_KEY=test123\nDATABASE_URL=postgres://localhost/test", session.environment_variables
  end

  test "cloning a session preserves environment variables in the new UI" do
    visit sessions_path
    
    within "div", text: @session.swarm_name do
      click_on "Use as template"
    end
    
    # Should be on new session page with environment variables populated
    assert_selector "h1", text: "Create Claude Swarm Session"
    
    # Check that environment variables are populated in the UI
    within "[data-session-environment-variables-target='container']" do
      inputs = all("input[type='text']")
      
      assert_equal 6, inputs.length # 3 key-value pairs = 6 inputs
      
      assert_equal "API_KEY", inputs[0].value
      assert_equal "secret123", inputs[1].value
      assert_equal "DEBUG", inputs[2].value
      assert_equal "true", inputs[3].value
      assert_equal "PORT", inputs[4].value
      assert_equal "3000", inputs[5].value
    end
    
    # Modify one and add a new one
    within "[data-session-environment-variables-target='container']" do
      inputs = all("input[type='text']")
      inputs[1].fill_in with: "new-secret"
    end
    
    click_on "Add Variable"
    within "[data-session-environment-variables-target='container']" do
      inputs = all("input[type='text']")
      inputs[6].fill_in with: "NEW_VAR"
      inputs[7].fill_in with: "new_value"
    end
    
    fill_in "Session Name", with: "Cloned Session"
    click_on "Create Session"
    
    # Verify the new session has the updated environment variables
    new_session = Session.last
    assert_includes new_session.environment_variables, "API_KEY=new-secret"
    assert_includes new_session.environment_variables, "DEBUG=true"
    assert_includes new_session.environment_variables, "PORT=3000"
    assert_includes new_session.environment_variables, "NEW_VAR=new_value"
  end

  test "removing environment variables works correctly" do
    visit new_session_path(clone_from: @session.id)
    
    # Should have 3 env vars loaded
    within "[data-session-environment-variables-target='container']" do
      assert_selector "[data-session-environment-variables-target='row']", count: 3
      
      # Remove the middle one (DEBUG=true)
      all("button[data-action='click->session-environment-variables#remove']")[1].click
      
      assert_selector "[data-session-environment-variables-target='row']", count: 2
      
      # Verify remaining values
      inputs = all("input[type='text']")
      assert_equal "API_KEY", inputs[0].value
      assert_equal "secret123", inputs[1].value
      assert_equal "PORT", inputs[2].value
      assert_equal "3000", inputs[3].value
    end
    
    fill_in "Session Name", with: "Session with removed var"
    click_on "Create Session"
    
    # Verify the session was created without the removed variable
    session = Session.last
    assert_equal "API_KEY=secret123\nPORT=3000", session.environment_variables
  end
end