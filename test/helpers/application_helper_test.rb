# frozen_string_literal: true

require "test_helper"

class ApplicationHelperTest < ActionView::TestCase
  test "log_entry_class returns correct class for request type" do
    expected_class = "bg-gradient-to-r from-blue-900/20 to-blue-950/20 border-blue-700/50 shadow-lg hover:shadow-blue-900/20 hover:border-blue-600/50"
    assert_equal expected_class, log_entry_class("request")
  end

  test "log_entry_class returns correct class for result type" do
    expected_class = "bg-gradient-to-r from-emerald-900/20 to-emerald-950/20 border-emerald-700/50 shadow-lg hover:shadow-emerald-900/20 hover:border-emerald-600/50"
    assert_equal expected_class, log_entry_class("result")
  end

  test "log_entry_class returns correct class for error type" do
    expected_class = "bg-gradient-to-r from-red-900/20 to-red-950/20 border-red-700/50 shadow-lg hover:shadow-red-900/20 hover:border-red-600/50"
    assert_equal expected_class, log_entry_class("error")
  end

  test "log_entry_class returns default class for unknown type" do
    expected_class = "bg-gradient-to-r from-stone-800/50 to-stone-900/50 border-stone-700/50 shadow-md hover:shadow-lg hover:border-stone-600/50"
    assert_equal expected_class, log_entry_class("unknown")
  end

  test "log_entry_class returns default class for nil type" do
    expected_class = "bg-gradient-to-r from-stone-800/50 to-stone-900/50 border-stone-700/50 shadow-md hover:shadow-lg hover:border-stone-600/50"
    assert_equal expected_class, log_entry_class(nil)
  end

  test "log_entry_class returns default class for empty string" do
    expected_class = "bg-gradient-to-r from-stone-800/50 to-stone-900/50 border-stone-700/50 shadow-md hover:shadow-lg hover:border-stone-600/50"
    assert_equal expected_class, log_entry_class("")
  end

  test "instance_color returns consistent color for same instance" do
    instance1 = "server_1"
    color1 = instance_color(instance1)
    color2 = instance_color(instance1)

    assert_equal color1, color2
  end

  test "instance_color returns valid color class" do
    instance = "test_instance"
    color = instance_color(instance)

    valid_colors = [
      "text-blue-400",
      "text-emerald-400",
      "text-purple-400",
      "text-orange-400",
      "text-pink-400",
      "text-yellow-400",
    ]

    assert_includes valid_colors, color
  end

  test "instance_color handles different instance types" do
    # Test with string
    assert_match(/^text-\w+-400$/, instance_color("string_instance"))

    # Test with symbol
    assert_match(/^text-\w+-400$/, instance_color(:symbol_instance))

    # Test with number
    assert_match(/^text-\w+-400$/, instance_color(12345))

    # Test with object
    obj = Object.new
    assert_match(/^text-\w+-400$/, instance_color(obj))
  end

  test "instance_color distributes colors across instances" do
    # Create multiple instances and check they use different colors
    instances = (1..20).map { |i| "instance_#{i}" }
    colors = instances.map { |instance| instance_color(instance) }

    # At least some variation in colors
    assert colors.uniq.length > 1
  end

  test "instance_color returns same color for objects with same string representation" do
    # Two objects with same to_s should get same color
    obj1 = Struct.new(:name).new("test")
    obj2 = Struct.new(:name).new("test")

    # Override to_s to return same value
    obj1.define_singleton_method(:to_s) { "same_value" }
    obj2.define_singleton_method(:to_s) { "same_value" }

    assert_equal instance_color(obj1), instance_color(obj2)
  end

  test "instance_color handles empty string" do
    color = instance_color("")

    valid_colors = [
      "text-blue-400",
      "text-emerald-400",
      "text-purple-400",
      "text-orange-400",
      "text-pink-400",
      "text-yellow-400",
    ]

    assert_includes valid_colors, color
  end

  test "instance_color handles nil by converting to string" do
    # nil.to_s returns empty string
    color = instance_color(nil)

    valid_colors = [
      "text-blue-400",
      "text-emerald-400",
      "text-purple-400",
      "text-orange-400",
      "text-pink-400",
      "text-yellow-400",
    ]

    assert_includes valid_colors, color
  end

  test "includes Pagy Frontend module" do
    assert_includes ApplicationHelper.included_modules, Pagy::Frontend
  end
end
