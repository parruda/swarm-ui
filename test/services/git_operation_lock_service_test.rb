# frozen_string_literal: true

require "test_helper"

class GitOperationLockServiceTest < ActiveSupport::TestCase
  setup do
    @session_id = "test-session-123"
    @directory = "/Users/test/project"
    @lock_key = "git_operation_lock:#{@session_id}:_Users_test_project"

    # Clear any existing locks
    Rails.cache.clear

    # Use memory store for testing
    @original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
  end

  teardown do
    Rails.cache.clear
    Rails.cache = @original_cache
  end

  # with_lock tests
  test "acquires lock and executes block" do
    executed = false
    result = GitOperationLockService.with_lock(@session_id, @directory) do
      executed = true
      "block result"
    end

    assert executed
    assert_equal "block result", result
  end

  test "releases lock after block execution" do
    GitOperationLockService.with_lock(@session_id, @directory) do
      # Lock should be held during block
      assert Rails.cache.exist?(@lock_key)
    end

    # Lock should be released after block
    assert_not Rails.cache.exist?(@lock_key)
  end

  test "releases lock even if block raises exception" do
    assert_raises(StandardError) do
      GitOperationLockService.with_lock(@session_id, @directory) do
        raise StandardError, "Test error"
      end
    end

    # Lock should still be released
    assert_not Rails.cache.exist?(@lock_key)
  end

  test "waits for lock when already held" do
    # Start with lock already held by another process
    Rails.cache.write(@lock_key, 999, expires_in: 30.seconds)

    # Track retries and sleeps
    sleep_count = 0
    sleep_times = []
    lock_key = @lock_key # Capture in local variable for closure

    # Mock the class to stub sleep
    GitOperationLockService.singleton_class.send(:define_method, :sleep) do |time|
      sleep_count += 1
      sleep_times << time
      # Release lock after 3 retries so the test can succeed
      Rails.cache.delete(lock_key) if sleep_count == 3
    end

    begin
      result = GitOperationLockService.with_lock(@session_id, @directory) do
        "success"
      end

      assert_equal("success", result)
      assert_equal(3, sleep_count, "Should have slept 3 times before acquiring lock")
      assert_equal(0.2, sleep_times[0], "First retry should sleep 0.2s")
      assert_equal(0.4, sleep_times[1], "Second retry should sleep 0.4s")
      assert_equal(0.8, sleep_times[2], "Third retry should sleep 0.8s")
    ensure
      # Restore original sleep method
      GitOperationLockService.singleton_class.send(:remove_method, :sleep)
    end
  end

  test "raises error after max retries" do
    # Hold lock permanently
    Rails.cache.write(@lock_key, 999, expires_in: 30.seconds)

    # Mock sleep to speed up test
    GitOperationLockService.stubs(:sleep)

    error = assert_raises(RuntimeError) do
      GitOperationLockService.with_lock(@session_id, @directory) do
        "should not execute"
      end
    end

    assert_equal "Another git operation is in progress. Please try again.", error.message
  end

  test "maximum wait time is capped at 2 seconds" do
    sleep_calls = []
    GitOperationLockService.stubs(:sleep) { |time| sleep_calls << time }

    # Hold lock for many retries
    Rails.cache.write(@lock_key, 999, expires_in: 30.seconds)

    error = assert_raises(RuntimeError) do
      GitOperationLockService.with_lock(@session_id, @directory) { "test" }
    end

    assert_equal "Another git operation is in progress. Please try again.", error.message

    # Later sleep calls should be capped at 2 seconds
    later_sleeps = sleep_calls.last(3)
    later_sleeps.each do |sleep_time|
      assert sleep_time <= 2, "Sleep time #{sleep_time} exceeds 2 second cap"
    end
  end

  test "uses process ID for lock value" do
    GitOperationLockService.with_lock(@session_id, @directory) do
      lock_value = Rails.cache.read(@lock_key)
      assert_equal Process.pid, lock_value
    end
  end

  test "handles directory paths with slashes" do
    complex_dir = "/Users/test/my/deep/project/path"
    expected_key = "git_operation_lock:#{@session_id}:_Users_test_my_deep_project_path"

    GitOperationLockService.with_lock(@session_id, complex_dir) do
      assert Rails.cache.exist?(expected_key)
    end
  end

  test "logs lock acquisition and release" do
    Rails.logger.expects(:debug).with("[GitLock] Attempting to acquire lock: #{@lock_key}")
    Rails.logger.expects(:debug).with("[GitLock] Lock acquired: #{@lock_key}")
    Rails.logger.expects(:debug).with("[GitLock] Lock released: #{@lock_key}")

    GitOperationLockService.with_lock(@session_id, @directory) do
      "test"
    end
  end

  test "logs retry attempts" do
    Rails.cache.write(@lock_key, 999, expires_in: 30.seconds)
    GitOperationLockService.stubs(:sleep)

    # Allow any debug messages
    Rails.logger.stubs(:debug)
    # Expect at least one logger call about retries and one about failure
    Rails.logger.expects(:debug).with(regexp_matches(%r{Lock busy, waiting.*retry \d+/10})).at_least_once
    Rails.logger.expects(:error).with(regexp_matches(/Failed to acquire lock after 10 retries/))

    error = assert_raises(RuntimeError) do
      GitOperationLockService.with_lock(@session_id, @directory) { "test" }
    end

    assert_equal "Another git operation is in progress. Please try again.", error.message
  end

  # locked? tests
  test "returns true when lock is held" do
    Rails.cache.write(@lock_key, Process.pid, expires_in: 30.seconds)

    assert GitOperationLockService.locked?(@session_id, @directory)
  end

  test "returns false when lock is not held" do
    assert_not GitOperationLockService.locked?(@session_id, @directory)
  end

  test "locked? handles complex directory paths" do
    complex_dir = "/Users/test/my/project"

    GitOperationLockService.with_lock(@session_id, complex_dir) do
      assert GitOperationLockService.locked?(@session_id, complex_dir)
    end
  end

  # force_release tests
  test "force releases a held lock" do
    Rails.cache.write(@lock_key, 999, expires_in: 30.seconds)
    assert Rails.cache.exist?(@lock_key)

    GitOperationLockService.force_release(@session_id, @directory)

    assert_not Rails.cache.exist?(@lock_key)
  end

  test "force_release logs warning" do
    Rails.logger.expects(:warn).with("[GitLock] Force released lock: #{@lock_key}")

    GitOperationLockService.force_release(@session_id, @directory)
  end

  test "force_release is safe when lock doesn't exist" do
    assert_nothing_raised do
      GitOperationLockService.force_release(@session_id, @directory)
    end
  end

  # Integration tests
  test "multiple threads can acquire lock sequentially" do
    results = []
    threads = []

    3.times do |i|
      threads << Thread.new do
        GitOperationLockService.with_lock(@session_id, @directory) do
          results << i
          sleep(0.01) # Small delay to ensure sequential execution
        end
      end
    end

    threads.each(&:join)

    # All threads should have executed
    assert_equal 3, results.length
  end

  test "lock expires after timeout" do
    # Write a lock that expires quickly
    Rails.cache.write(@lock_key, 999, expires_in: 0.1.seconds)

    # Wait for expiration
    sleep 0.2

    # Should be able to acquire lock now
    executed = false
    GitOperationLockService.with_lock(@session_id, @directory) do
      executed = true
    end

    assert executed
  end

  test "different sessions can hold locks simultaneously" do
    other_session = "other-session-456"
    both_executed = false

    GitOperationLockService.with_lock(@session_id, @directory) do
      GitOperationLockService.with_lock(other_session, @directory) do
        both_executed = true
      end
    end

    assert both_executed
  end

  test "same session different directories can lock simultaneously" do
    other_dir = "/Users/test/other"
    both_executed = false

    GitOperationLockService.with_lock(@session_id, @directory) do
      GitOperationLockService.with_lock(@session_id, other_dir) do
        both_executed = true
      end
    end

    assert both_executed
  end
end
