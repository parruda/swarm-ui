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

    assert_select "h1", "Projects"
    assert_select ".bg-white", minimum: 1
  end

  test "index should show active and archived projects separately" do
    get projects_url
    assert_response :success

    assert_match @project.name, @response.body
    assert_match @archived_project.name, @response.body

    # Active projects should not have opacity-75 class
    assert_select "div.opacity-75", count: 1 # Only the archived project
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

    assert_redirected_to project_url(@project)
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

    assert_redirected_to projects_url
    assert_equal "Project was successfully archived.", flash[:notice]

    @project.reload
    assert @project.archived?
  end

  test "should archive project via archive action" do
    assert_not @project.archived?

    post archive_project_url(@project)

    assert_redirected_to projects_url
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
      github_repo_name: "repo"
    )
    
    # Create initial webhook events
    push_event = @project.github_webhook_events.create!(event_type: "push", enabled: true)
    pr_event = @project.github_webhook_events.create!(event_type: "pull_request", enabled: false)
    
    # Mock webhook running state
    process = @project.github_webhook_processes.create!(
      pid: 12345,
      status: "running",
      started_at: Time.current
    )
    
    # Expect PostgreSQL notification
    ActiveRecord::Base.connection.expects(:execute).with(
      "NOTIFY webhook_events_changed, '#{@project.id}'"
    )
    
    # Update webhook events
    patch project_url(@project), params: {
      project: {
        name: @project.name,
        webhook_events: ["push", "pull_request", "issues"]
      }
    }
    
    assert_redirected_to project_url(@project)
    
    # Verify events were updated
    @project.reload
    assert_equal 3, @project.github_webhook_events.enabled.count
    assert @project.github_webhook_events.find_by(event_type: "push").enabled?
    assert @project.github_webhook_events.find_by(event_type: "pull_request").enabled?
    assert @project.github_webhook_events.find_by(event_type: "issues").enabled?
  end

  test "should not trigger restart notification if webhook not running" do
    # Setup project with GitHub configuration but webhook disabled
    @project.update!(
      github_webhook_enabled: false,
      github_repo_owner: "test",
      github_repo_name: "repo"
    )
    
    # Should not expect any notification
    ActiveRecord::Base.connection.expects(:execute).never
    
    # Update webhook events
    patch project_url(@project), params: {
      project: {
        name: @project.name,
        webhook_events: ["push", "pull_request"]
      }
    }
    
    assert_redirected_to project_url(@project)
  end
end
