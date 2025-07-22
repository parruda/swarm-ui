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
    assert @rake.tasks.map(&:name).include?("db:ensure_user")
  end

  test "db:prepare depends on db:ensure_user" do
    db_prepare_task = @rake.tasks.find { |t| t.name == "db:prepare" }
    assert db_prepare_task.prerequisites.include?("ensure_user")
  end
end