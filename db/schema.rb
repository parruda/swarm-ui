# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2025_08_06_011912) do
  create_table "file_viewer_sessions", force: :cascade do |t|
    t.integer "session_id", null: false
    t.string "viewer_id", null: false
    t.string "directory", null: false
    t.string "instance_name", null: false
    t.string "name", null: false
    t.string "status", default: "active", null: false
    t.datetime "opened_at"
    t.datetime "closed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["session_id"], name: "index_file_viewer_sessions_on_session_id"
    t.index ["status"], name: "index_file_viewer_sessions_on_status"
    t.index ["viewer_id"], name: "index_file_viewer_sessions_on_viewer_id", unique: true
  end

  create_table "github_webhook_events", force: :cascade do |t|
    t.bigint "project_id", null: false
    t.string "event_type"
    t.boolean "enabled", default: true
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["project_id"], name: "index_github_webhook_events_on_project_id"
  end

  create_table "github_webhook_processes", force: :cascade do |t|
    t.bigint "project_id", null: false
    t.integer "pid"
    t.string "status"
    t.datetime "started_at"
    t.datetime "stopped_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["project_id"], name: "index_github_webhook_processes_on_project_id"
  end

  create_table "instance_templates", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.string "model"
    t.string "provider"
    t.text "system_prompt"
    t.string "directory"
    t.json "tools"
    t.json "allowed_tools"
    t.json "disallowed_tools"
    t.boolean "worktree", default: false
    t.boolean "vibe", default: false
    t.float "temperature"
    t.string "api_version"
    t.string "reasoning_effort"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.json "config", default: {}, null: false
    t.json "required_variables", default: []
    t.json "metadata", default: {}
    t.integer "usage_count", default: 0
    t.json "tags", default: []
    t.index ["name"], name: "index_instance_templates_on_name"
  end

  create_table "mcp_servers", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.string "server_type", null: false
    t.string "command"
    t.string "url"
    t.json "args", default: []
    t.json "env", default: {}
    t.json "headers", default: {}
    t.json "tags", default: []
    t.json "metadata", default: {}
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_mcp_servers_on_name"
    t.index ["server_type"], name: "index_mcp_servers_on_server_type"
  end

  create_table "projects", force: :cascade do |t|
    t.string "name", null: false
    t.string "path", null: false
    t.string "vcs_type"
    t.string "default_config_path"
    t.boolean "default_use_worktree", default: false
    t.boolean "archived", default: false
    t.datetime "last_session_at"
    t.integer "total_sessions_count", default: 0
    t.integer "active_sessions_count", default: 0
    t.text "environment_variables"
    t.json "preferred_models", default: {}
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "github_webhook_enabled", default: false
    t.string "github_repo_owner"
    t.string "github_repo_name"
    t.string "git_url"
    t.string "import_status"
    t.text "import_error"
    t.datetime "import_started_at"
    t.datetime "import_completed_at"
    t.json "webhook_commands", default: []
    t.index ["archived"], name: "index_projects_on_archived"
    t.index ["import_status"], name: "index_projects_on_import_status"
    t.index ["path"], name: "index_projects_on_path", unique: true
  end

  create_table "sessions", force: :cascade do |t|
    t.string "session_id", null: false
    t.string "swarm_name"
    t.string "project_folder_name"
    t.datetime "started_at"
    t.datetime "ended_at"
    t.integer "duration_seconds"
    t.string "status"
    t.text "configuration"
    t.string "configuration_path"
    t.json "metadata"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "use_worktree", default: false, null: false
    t.string "session_path", null: false
    t.datetime "resumed_at"
    t.text "environment_variables"
    t.bigint "project_id", null: false
    t.text "initial_prompt"
    t.integer "github_issue_number"
    t.integer "github_pr_number"
    t.string "github_issue_type"
    t.index ["project_id", "github_issue_number"], name: "index_sessions_on_project_id_and_github_issue_number"
    t.index ["project_id", "github_pr_number"], name: "index_sessions_on_project_id_and_github_pr_number"
    t.index ["project_id"], name: "index_sessions_on_project_id"
    t.index ["session_id"], name: "index_sessions_on_session_id", unique: true
    t.index ["status", "updated_at"], name: "index_sessions_on_status_and_updated_at"
  end

  create_table "settings", force: :cascade do |t|
    t.string "openai_api_key"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "github_username"
  end

  create_table "swarm_template_instances", force: :cascade do |t|
    t.integer "swarm_template_id", null: false
    t.integer "instance_template_id", null: false
    t.string "instance_key", null: false
    t.json "overrides", default: {}
    t.integer "position"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["instance_template_id"], name: "index_swarm_template_instances_on_instance_template_id"
    t.index ["position"], name: "index_swarm_template_instances_on_position"
    t.index ["swarm_template_id", "instance_key"], name: "idx_swarm_template_instances_unique", unique: true
    t.index ["swarm_template_id"], name: "index_swarm_template_instances_on_swarm_template_id"
  end

  create_table "swarm_templates", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.json "instance_config"
    t.string "main_instance"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "project_id"
    t.json "config_data", default: {}
    t.text "yaml_cache"
    t.datetime "yaml_cache_generated_at"
    t.json "metadata", default: {}
    t.integer "version", default: 1
    t.integer "usage_count", default: 0
    t.json "tags", default: []
    t.boolean "public", default: false
    t.index ["name"], name: "index_swarm_templates_on_name"
    t.index ["project_id"], name: "index_swarm_templates_on_project_id"
    t.index ["public"], name: "index_swarm_templates_on_public"
  end

  create_table "terminal_sessions", force: :cascade do |t|
    t.integer "session_id", null: false
    t.string "terminal_id", null: false
    t.string "directory", null: false
    t.string "instance_name", null: false
    t.string "name", null: false
    t.string "status", default: "active", null: false
    t.datetime "opened_at", null: false
    t.datetime "ended_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["session_id", "status"], name: "index_terminal_sessions_on_session_id_and_status"
    t.index ["session_id"], name: "index_terminal_sessions_on_session_id"
    t.index ["terminal_id"], name: "index_terminal_sessions_on_terminal_id", unique: true
  end

  create_table "version_checkers", force: :cascade do |t|
    t.string "remote_version"
    t.datetime "checked_at"
    t.integer "singleton_guard"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["singleton_guard"], name: "index_version_checkers_on_singleton_guard", unique: true
  end

  add_foreign_key "file_viewer_sessions", "sessions"
  add_foreign_key "github_webhook_events", "projects"
  add_foreign_key "github_webhook_processes", "projects"
  add_foreign_key "sessions", "projects"
  add_foreign_key "swarm_template_instances", "instance_templates"
  add_foreign_key "swarm_template_instances", "swarm_templates"
  add_foreign_key "swarm_templates", "projects"
  add_foreign_key "terminal_sessions", "sessions"
end
