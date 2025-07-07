# frozen_string_literal: true

require "test_helper"

class InstanceTemplateTest < ActiveSupport::TestCase
  test "should not save instance template without name" do
    template = InstanceTemplate.new(provider: "claude", model: "opus")
    assert_not template.save
  end

  test "should not save instance template with duplicate name" do
    InstanceTemplate.create!(name: "test-template", provider: "claude", model: "opus")
    duplicate = InstanceTemplate.new(name: "test-template", provider: "claude", model: "sonnet")
    assert_not duplicate.save
  end

  test "should validate provider inclusion" do
    template = InstanceTemplate.new(name: "test", provider: "invalid", model: "opus")
    assert_not template.valid?
    assert_includes template.errors[:provider], "is not included in the list"
  end

  test "should validate model presence" do
    template = InstanceTemplate.new(name: "test", provider: "claude")
    assert_not template.valid?
    assert_includes template.errors[:model], "can't be blank"
  end

  test "should validate claude models" do
    template = InstanceTemplate.new(name: "test", provider: "claude", model: "gpt-4o")
    assert_not template.valid?
    assert_includes template.errors[:model], "gpt-4o is not valid for claude provider"

    ["opus", "sonnet", "haiku"].each do |model|
      template = InstanceTemplate.new(name: "test-#{model}", provider: "claude", model: model)
      assert template.valid?
    end
  end

  test "should validate openai models" do
    template = InstanceTemplate.new(name: "test", provider: "openai", model: "opus", api_version: "chat_completion")
    assert_not template.valid?
    assert_includes template.errors[:model], "opus is not valid for openai provider"

    ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3-mini"].each do |model|
      template = InstanceTemplate.new(name: "test-#{model}", provider: "openai", model: model, api_version: "chat_completion")
      assert template.valid?
    end
  end

  test "should require api_version for openai provider" do
    template = InstanceTemplate.new(name: "test", provider: "openai", model: "gpt-4o")
    assert_not template.valid?
    assert_includes template.errors[:api_version], "is not included in the list"
  end

  test "should validate reasoning_effort only for o-series models" do
    # Non o-series model with reasoning_effort
    template = InstanceTemplate.new(
      name: "test",
      provider: "openai",
      model: "gpt-4o",
      api_version: "chat_completion",
      reasoning_effort: "high",
    )
    assert_not template.valid?
    assert_includes template.errors[:reasoning_effort], "can only be set for o-series models"

    # O-series model with reasoning_effort
    template = InstanceTemplate.new(
      name: "test-o1",
      provider: "openai",
      model: "o1",
      api_version: "responses",
      reasoning_effort: "high",
    )
    assert template.valid?
  end

  test "claude? and openai? helper methods" do
    claude_template = InstanceTemplate.new(provider: "claude")
    openai_template = InstanceTemplate.new(provider: "openai")

    assert claude_template.claude?
    assert_not claude_template.openai?
    assert openai_template.openai?
    assert_not openai_template.claude?
  end

  test "o_series? helper method" do
    o1_template = InstanceTemplate.new(model: "o1")
    o3_template = InstanceTemplate.new(model: "o3-mini")
    gpt_template = InstanceTemplate.new(model: "gpt-4o")

    assert o1_template.o_series?
    assert o3_template.o_series?
    assert_not gpt_template.o_series?
  end

  test "scopes" do
    claude_template = InstanceTemplate.create!(name: "claude-test", provider: "claude", model: "opus")
    openai_template = InstanceTemplate.create!(name: "openai-test", provider: "openai", model: "gpt-4o", api_version: "chat_completion")
    worktree_template = InstanceTemplate.create!(name: "worktree-test", provider: "claude", model: "sonnet", worktree: true)
    vibe_template = InstanceTemplate.create!(name: "vibe-test", provider: "claude", model: "haiku", vibe: true)

    assert_includes InstanceTemplate.claude, claude_template
    assert_includes InstanceTemplate.openai, openai_template
    assert_includes InstanceTemplate.with_worktree, worktree_template
    assert_includes InstanceTemplate.vibe_mode, vibe_template
  end
end
