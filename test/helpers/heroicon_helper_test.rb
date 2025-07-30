# frozen_string_literal: true

require "test_helper"

class HeroiconHelperTest < ActionView::TestCase
  test "module exists" do
    assert_kind_of Module, HeroiconHelper
  end

  test "includes Heroicon Engine helpers" do
    assert_includes HeroiconHelper.included_modules, Heroicon::Engine.helpers
  end

  test "module can be included" do
    test_class = Class.new do
      include HeroiconHelper
    end

    assert_includes test_class.included_modules, HeroiconHelper
  end

  test "provides access to heroicon method when included" do
    # Since this module includes Heroicon::Engine.helpers,
    # classes that include this module should have access to heroicon methods
    test_class = Class.new(ActionView::Base) do
      include HeroiconHelper
    end

    instance = test_class.new(ActionView::LookupContext.new([]), {}, nil)

    # The heroicon method should be available
    assert_respond_to instance, :heroicon
  end

  # NOTE: Since HeroiconHelper is just a wrapper that includes Heroicon::Engine.helpers,
  # the actual heroicon rendering is tested by the heroicon gem itself.
  # We're only testing that the module properly includes the engine helpers.
end
