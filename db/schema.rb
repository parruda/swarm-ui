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

ActiveRecord::Schema[8.0].define(version: 2025_07_08_000743) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "instance_templates", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.string "model"
    t.string "provider"
    t.text "prompt"
    t.string "directory"
    t.jsonb "tools"
    t.jsonb "allowed_tools"
    t.jsonb "disallowed_tools"
    t.boolean "worktree", default: false
    t.boolean "vibe", default: false
    t.float "temperature"
    t.string "api_version"
    t.string "reasoning_effort"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_instance_templates_on_name"
  end

  create_table "sessions", force: :cascade do |t|
    t.string "session_id", null: false
    t.string "swarm_name"
    t.string "project_path"
    t.string "project_folder_name"
    t.datetime "started_at"
    t.datetime "ended_at"
    t.integer "duration_seconds"
    t.string "status"
    t.text "configuration"
    t.string "configuration_path"
    t.jsonb "metadata"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "use_worktree", default: false, null: false
    t.index ["session_id"], name: "index_sessions_on_session_id", unique: true
  end

  create_table "swarm_templates", force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.jsonb "instance_config"
    t.string "main_instance"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_swarm_templates_on_name"
  end
end
