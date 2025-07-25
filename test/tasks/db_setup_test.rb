# frozen_string_literal: true

require "test_helper"
require "rake"

class DbSetupTest < ActiveSupport::TestCase
  def setup
    @rake = Rake.application
    @rake.init
    @rake.load_rakefile
  end

  test "db:ensure_user task is defined" do
    assert_includes @rake.tasks.map(&:name), "db:ensure_user"
  end

  test "db:prepare depends on db:ensure_user" do
    db_prepare_task = @rake.tasks.find { |t| t.name == "db:prepare" }
    assert_includes db_prepare_task.prerequisites, "ensure_user"
  end
end
