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

ActiveRecord::Schema[8.0].define(version: 2025_07_04_224211) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "directories", force: :cascade do |t|
    t.text "path", null: false
    t.string "name"
    t.boolean "is_git_repository", default: false
    t.bigint "default_swarm_configuration_id"
    t.datetime "last_accessed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["default_swarm_configuration_id"], name: "index_directories_on_default_swarm_configuration_id"
    t.index ["path"], name: "index_directories_on_path", unique: true
  end

  create_table "instance_templates", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.string "instance_type"
    t.string "model", default: "sonnet"
    t.text "prompt"
    t.text "allowed_tools", default: [], array: true
    t.text "disallowed_tools", default: [], array: true
    t.boolean "vibe", default: false
    t.string "provider", default: "claude"
    t.decimal "temperature", precision: 3, scale: 2
    t.string "api_version"
    t.string "openai_token_env"
    t.text "base_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "sessions", force: :cascade do |t|
    t.string "session_id", null: false
    t.text "session_path", null: false
    t.bigint "swarm_configuration_id"
    t.string "swarm_name"
    t.string "mode", default: "interactive"
    t.string "status", default: "active"
    t.string "tmux_session"
    t.text "output_file"
    t.integer "pid"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "working_directory"
    t.text "worktree_path"
    t.datetime "launched_at"
    t.index ["session_id"], name: "index_sessions_on_session_id", unique: true
    t.index ["swarm_configuration_id"], name: "index_sessions_on_swarm_configuration_id"
  end

  create_table "swarm_configurations", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.text "config_yaml", null: false
    t.boolean "is_template", default: false
    t.text "before", default: [], array: true
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "swarm_instance_templates", force: :cascade do |t|
    t.bigint "swarm_configuration_id", null: false
    t.bigint "instance_template_id"
    t.string "instance_name", null: false
    t.text "directory"
    t.text "connections", default: [], array: true
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["instance_template_id"], name: "index_swarm_instance_templates_on_instance_template_id"
    t.index ["swarm_configuration_id", "instance_name"], name: "index_swarm_instance_templates_unique", unique: true
    t.index ["swarm_configuration_id"], name: "index_swarm_instance_templates_on_swarm_configuration_id"
  end

  add_foreign_key "directories", "swarm_configurations", column: "default_swarm_configuration_id"
  add_foreign_key "sessions", "swarm_configurations"
  add_foreign_key "swarm_instance_templates", "instance_templates"
  add_foreign_key "swarm_instance_templates", "swarm_configurations", on_delete: :cascade
end
