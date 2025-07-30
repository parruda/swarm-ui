# frozen_string_literal: true

require "test_helper"

class GithubWebhooksHelperTest < ActionView::TestCase
  test "module exists" do
    assert_kind_of Module, GithubWebhooksHelper
  end

  test "module can be included" do
    test_class = Class.new do
      include GithubWebhooksHelper
    end

    assert_includes test_class.included_modules, GithubWebhooksHelper
  end

  # NOTE: GithubWebhooksHelper is currently empty.
  # Add tests here when methods are added to the helper.
end
