# frozen_string_literal: true

require "application_system_test_case"

class ProjectsTest < ApplicationSystemTestCase
  setup do
    @project = create(:project)
    @test_dir = "/tmp/test_projects_system_#{Process.pid}"
    FileUtils.mkdir_p(@test_dir)
  end

  teardown do
    FileUtils.rm_rf(@test_dir) if File.exist?(@test_dir)
  end

  test "visiting the index" do
    visit projects_url

    assert_selector "h1", text: "Projects"
    assert_text @project.name
    assert_text @project.path
  end

  test "creating a new project" do
    visit projects_url
    click_on "New Project"

    fill_in "Name", with: "My Test Project"
    fill_in "Path", with: @test_dir
    check "Use worktree by default"

    click_on "Create Project"

    assert_text "Project was successfully created"
    assert_selector "h1", text: "My Test Project"
    assert_text @test_dir
    assert_text "Yes" # Use worktree by default
  end

  test "updating a project" do
    visit project_url(@project)
    click_on "Edit"

    fill_in "Name", with: "Updated Project Name"
    fill_in "Default config path", with: "custom-swarm.yml"

    click_on "Update Project"

    assert_text "Project was successfully updated"
    assert_selector "h1", text: "Updated Project Name"
    assert_text "custom-swarm.yml"
  end

  test "archiving and unarchiving a project" do
    visit project_url(@project)

    accept_confirm do
      click_on "Archive"
    end

    assert_text "Project was successfully archived"
    assert_text "Archived Projects"
    assert_text @project.name

    within ".opacity-75" do
      click_on "Restore"
    end

    assert_text "Project was successfully restored"
    assert_text "Active Projects"
  end

  test "showing project details" do
    visit project_url(@project)

    assert_selector "h1", text: @project.name
    assert_text @project.path
    assert_text "Git Repository" if @project.git?
    assert_text "Total Sessions"
    assert_text "Active Sessions"
    assert_text "Session association coming soon"
  end

  test "navigating from projects index to new session" do
    visit projects_url

    within "div", text: @project.name do
      click_on @project.name
    end

    assert_selector "h1", text: @project.name

    click_on "New Session"

    assert_selector "h1", text: "Create Claude Swarm Session"
    assert_field "Project Path", with: @project.path
  end
end

