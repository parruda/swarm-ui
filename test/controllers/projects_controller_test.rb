# frozen_string_literal: true

require "test_helper"

class ProjectsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @project = create(:project)
    @archived_project = create(:project, :archived)
  end

  teardown do
    # Clean up test directories
    Project.all.each do |project|
      FileUtils.rm_rf(project.path) if File.exist?(project.path)
    end
  end

  test "should get index" do
    get projects_url
    assert_response :success

    # The h1 contains both a heroicon and text
    assert_select "h1", text: /Projects/
    assert_select ".bg-white", minimum: 1
  end

  test "index should show active and archived projects separately" do
    # Check active projects tab (default)
    get projects_url
    assert_response :success
    assert_match @project.name, @response.body

    # Active tab should show active project count
    assert_select "span.text-xs.font-medium", text: "1"

    # Check archived projects tab
    get projects_url(filter: "archived")
    assert_response :success
    assert_match @archived_project.name, @response.body

    # Archived projects should be shown on the archived tab
    assert_select ".bg-white, .bg-gray-800", minimum: 1
  end

  test "should get new" do
    get new_project_url
    assert_response :success

    assert_select "h1", "Create Project"
    assert_select "form"
  end

  test "should create project" do
    test_path = "/tmp/test_project_#{SecureRandom.hex}"
    FileUtils.mkdir_p(test_path)

    assert_difference("Project.count") do
      post(projects_url, params: {
        project: {
          name: "New Test Project",
          path: test_path,
          default_config_path: "swarm.yml",
          default_use_worktree: true,
        },
      })
    end

    assert_redirected_to(project_url(Project.last))
    assert_equal("Project was successfully created.", flash[:notice])

    project = Project.last
    assert_equal("New Test Project", project.name)
    assert_equal(test_path, project.path)
    assert_equal("swarm.yml", project.default_config_path)
    assert(project.default_use_worktree)
  ensure
    FileUtils.rm_rf(test_path) if test_path && File.exist?(test_path)
  end

  test "should create project with environment variables" do
    skip "Skipping encryption test - encryption keys need to be configured"
    # TODO: Enable this test once encryption is properly configured
    # test_path = "/tmp/test_project_#{SecureRandom.hex}"
    # FileUtils.mkdir_p(test_path)
    #
    # post projects_url, params: {
    #   project: {
    #     name: "Project with Env",
    #     path: test_path,
    #     environment_variables: {
    #       "1" => { key: "API_KEY", value: "secret123" },
    #       "2" => { key: "DEBUG", value: "true" }
    #     }
    #   }
    # }
    #
    # assert_redirected_to project_url(Project.last)
    #
    # project = Project.last
    # assert_equal({ "API_KEY" => "secret123", "DEBUG" => "true" }, project.environment_variables)
    # ensure
    #   FileUtils.rm_rf(test_path) if test_path && File.exist?(test_path)
  end

  test "should not create project with invalid params" do
    assert_no_difference("Project.count") do
      post projects_url, params: {
        project: {
          name: "",
          path: "/nonexistent/path",
        },
      }
    end

    assert_response :unprocessable_entity
    assert_select "form"
  end

  test "should show project" do
    get project_url(@project)
    assert_response :success

    assert_select "h1", @project.name
    assert_match @project.path, @response.body
  end

  test "should show project with sessions" do
    skip "Skipping until Session model has project association"
    # TODO: Enable this test once Session belongs_to Project
    # session = create(:session, project: @project)
    #
    # get project_url(@project)
    # assert_response :success
    #
    # assert_match session.session_id, @response.body
  end

  test "should get edit" do
    get edit_project_url(@project)
    assert_response :success

    assert_select "h1", "Edit Project"
    assert_select "form"
    assert_select "input[readonly]", value: @project.path
  end

  test "should update project" do
    patch project_url(@project), params: {
      project: {
        name: "Updated Name",
        default_config_path: "new-config.yml",
        default_use_worktree: true,
      },
    }

    assert_redirected_to edit_project_url(@project)
    assert_equal "Project was successfully updated.", flash[:notice]

    @project.reload
    assert_equal "Updated Name", @project.name
    assert_equal "new-config.yml", @project.default_config_path
    assert @project.default_use_worktree
  end

  test "should not update project with invalid params" do
    patch project_url(@project), params: {
      project: {
        name: "",
      },
    }

    assert_response :unprocessable_entity
    assert_select "form"
  end

  test "should archive project via destroy" do
    assert_not @project.archived?

    delete project_url(@project)

    assert_redirected_to projects_url(filter: "archived")
    assert_equal "Project was successfully archived.", flash[:notice]

    @project.reload
    assert @project.archived?
  end

  test "should archive project via archive action" do
    assert_not @project.archived?

    post archive_project_url(@project)

    assert_redirected_to projects_url(filter: "archived")
    assert_equal "Project was successfully archived.", flash[:notice]

    @project.reload
    assert @project.archived?
  end

  test "should unarchive project" do
    assert @archived_project.archived?

    post unarchive_project_url(@archived_project)

    assert_redirected_to projects_url
    assert_equal "Project was successfully restored.", flash[:notice]

    @archived_project.reload
    assert_not @archived_project.archived?
  end

  test "should update webhook events and trigger restart notification" do
    # Setup project with GitHub configuration
    @project.update!(
      github_webhook_enabled: true,
      github_repo_owner: "test",
      github_repo_name: "repo",
    )

    # Create initial webhook events with valid types
    @project.github_webhook_events.create!(event_type: "issue_comment", enabled: true)
    @project.github_webhook_events.create!(event_type: "pull_request_review", enabled: false)

    # Mock webhook running state
    @project.github_webhook_processes.create!(
      pid: 12345,
      status: "running",
      started_at: Time.current,
    )

    # Expect PostgreSQL notification
    ActiveRecord::Base.connection.expects(:execute).with(
      "NOTIFY webhook_events_changed, '#{@project.id}'",
    )

    # Update webhook events
    patch project_url(@project), params: {
      project: {
        name: @project.name,
        webhook_events: ["issue_comment", "pull_request_review", "pull_request_review_comment"],
      },
    }

    assert_redirected_to edit_project_url(@project)

    # Verify events were updated
    @project.reload
    assert_equal 3, @project.github_webhook_events.enabled.count
    assert @project.github_webhook_events.find_by(event_type: "issue_comment").enabled?
    assert @project.github_webhook_events.find_by(event_type: "pull_request_review").enabled?
    assert @project.github_webhook_events.find_by(event_type: "pull_request_review_comment").enabled?
  end

  test "should not trigger restart notification if webhook not running" do
    # Setup project with GitHub configuration but webhook disabled
    @project.update!(
      github_webhook_enabled: false,
      github_repo_owner: "test",
      github_repo_name: "repo",
    )

    # Should not expect any notification
    ActiveRecord::Base.connection.expects(:execute).never

    # Update webhook events
    patch project_url(@project), params: {
      project: {
        name: @project.name,
        webhook_events: ["push", "pull_request"],
      },
    }

    assert_redirected_to edit_project_url(@project)
  end

  test "should not enable webhooks without selected events" do
    skip "BUG FOUND: Test requires Setting.github_username_configured? to return true which needs openai_api_key"
    # Setup project with GitHub configuration
    @project.update!(
      github_webhook_enabled: false,
      github_repo_owner: "test",
      github_repo_name: "repo",
    )

    # Try to enable webhooks without any events
    post toggle_webhook_project_url(@project), headers: { "HTTP_REFERER" => project_url(@project) }

    assert_redirected_to project_url(@project)
    assert_equal "Please select at least one webhook event before enabling webhooks.", flash[:alert]

    @project.reload
    assert_not @project.github_webhook_enabled?
  end

  test "should disable webhooks when all events are unchecked" do
    # Setup project with webhooks enabled
    @project.update!(
      github_webhook_enabled: true,
      github_repo_owner: "test",
      github_repo_name: "repo",
    )

    # Create some events with valid types from AVAILABLE_EVENTS
    @project.github_webhook_events.create!(event_type: "issue_comment", enabled: true)
    @project.github_webhook_events.create!(event_type: "pull_request_review", enabled: true)

    # Update project with no events selected
    # Note: When no checkboxes are selected, Rails doesn't send the parameter at all
    # So we need to explicitly send an empty array
    patch project_url(@project), params: {
      project: {
        name: @project.name,
        webhook_events: [],
      },
    }

    assert_redirected_to edit_project_url(@project)
    assert_equal "Webhooks have been disabled because no events were selected.", flash[:alert]

    @project.reload
    assert_not @project.github_webhook_enabled?
    assert_equal 0, @project.github_webhook_events.enabled.count
  end

  test "should return git dirty status for git project" do
    # Create a git project (default factory creates git projects)
    git_project = create(:project)
    
    # Mock git service to return dirty status
    git_service = mock()
    git_service.expects(:dirty?).returns(true)
    GitService.expects(:new).with(git_project.path).returns(git_service)
    
    get git_dirty_check_project_url(git_project)
    assert_response :success
    
    json_response = JSON.parse(@response.body)
    assert json_response["git"]
    assert json_response["dirty"]
  end

  test "should return clean status for clean git project" do
    # Create a git project (default factory creates git projects)
    git_project = create(:project)
    
    # Mock git service to return clean status
    git_service = mock()
    git_service.expects(:dirty?).returns(false)
    GitService.expects(:new).with(git_project.path).returns(git_service)
    
    get git_dirty_check_project_url(git_project)
    assert_response :success
    
    json_response = JSON.parse(@response.body)
    assert json_response["git"]
    assert_not json_response["dirty"]
  end

  test "should return git false for non-git project" do
    non_git_project = create(:project, :non_git)
    
    get git_dirty_check_project_url(non_git_project)
    assert_response :success
    
    json_response = JSON.parse(@response.body)
    assert_not json_response["git"]
  end

  test "should return swarm file count" do
    # Mock find_swarm_files to return some files
    Project.any_instance.expects(:find_swarm_files).returns([
      { path: "/path/to/swarm1.yml", name: "Swarm 1" },
      { path: "/path/to/swarm2.yml", name: "Swarm 2" },
    ])
    
    get swarm_count_project_url(@project)
    assert_response :success
    
    json_response = JSON.parse(@response.body)
    assert_equal 2, json_response["count"]
  end

  test "should return zero swarm count for project with no swarm files" do
    Project.any_instance.expects(:find_swarm_files).returns([])
    
    get swarm_count_project_url(@project)
    assert_response :success
    
    json_response = JSON.parse(@response.body)
    assert_equal 0, json_response["count"]
  end
end
