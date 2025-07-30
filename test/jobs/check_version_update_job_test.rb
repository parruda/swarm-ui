# frozen_string_literal: true

require "test_helper"

class CheckVersionUpdateJobTest < ActiveJob::TestCase
  setup do
    @version_checker = VersionChecker.instance
    @version_checker.update!(remote_version: nil, checked_at: nil)
  end

  test "fetches remote version and updates version checker" do
    remote_version = "2.0.0"

    # Mock HTTP response
    mock_response = stub(
      is_a?: true,
      body: "#{remote_version}\n",
    )
    mock_response.stubs(:is_a?).with(Net::HTTPSuccess).returns(true)

    Net::HTTP.expects(:get_response).returns(mock_response)
    # Allow any info logs
    Rails.logger.stubs(:info)

    CheckVersionUpdateJob.perform_now

    @version_checker.reload
    assert_equal remote_version, @version_checker.remote_version
    assert_not_nil @version_checker.checked_at
  end

  test "includes cache-busting parameter in URL" do
    Time.stubs(:current).returns(Time.at(1234567890))

    expected_uri = URI("https://raw.githubusercontent.com/parruda/swarm-ui/refs/heads/main/VERSION")
    expected_uri.query = "t=1234567890"

    Net::HTTP.expects(:get_response).with(expected_uri).returns(
      stub(is_a?: true, body: "1.0.0"),
    )

    CheckVersionUpdateJob.perform_now
  end

  test "handles non-success HTTP responses" do
    mock_response = stub(is_a?: false)
    mock_response.stubs(:is_a?).with(Net::HTTPSuccess).returns(false)

    Net::HTTP.expects(:get_response).returns(mock_response)

    CheckVersionUpdateJob.perform_now

    @version_checker.reload
    assert_nil @version_checker.remote_version
  end

  test "handles HTTP errors gracefully" do
    Net::HTTP.expects(:get_response).raises(StandardError.new("Connection refused"))
    Rails.logger.expects(:error).with(regexp_matches(/Failed to fetch remote version: Connection refused/))

    # Should not raise error
    assert_nothing_raised do
      CheckVersionUpdateJob.perform_now
    end

    @version_checker.reload
    assert_nil @version_checker.remote_version
  end

  test "handles timeout errors" do
    Net::HTTP.expects(:get_response).raises(Net::ReadTimeout.new("Timeout"))
    Rails.logger.expects(:error).with(regexp_matches(/Failed to fetch remote version:.*Timeout/))

    assert_nothing_raised do
      CheckVersionUpdateJob.perform_now
    end

    @version_checker.reload
    assert_nil @version_checker.remote_version
  end

  test "strips whitespace from version" do
    mock_response = stub(
      is_a?: true,
      body: "  1.2.3  \n\n",
    )
    mock_response.stubs(:is_a?).with(Net::HTTPSuccess).returns(true)

    Net::HTTP.expects(:get_response).returns(mock_response)

    CheckVersionUpdateJob.perform_now

    @version_checker.reload
    assert_equal "1.2.3", @version_checker.remote_version
  end

  test "uses correct GitHub URL" do
    expected_url = "https://raw.githubusercontent.com/parruda/swarm-ui/refs/heads/main/VERSION"

    Net::HTTP.expects(:get_response).with { |uri| uri.to_s.start_with?(expected_url) }.returns(
      stub(is_a?: false),
    )

    CheckVersionUpdateJob.perform_now
  end

  test "job is queued in default queue" do
    assert_equal "default", CheckVersionUpdateJob.new.queue_name
  end

  test "updates checked_at even if version is the same" do
    initial_time = 2.hours.ago
    @version_checker.update!(remote_version: "1.0.0", checked_at: initial_time)

    mock_response = stub(
      is_a?: true,
      body: "1.0.0",
    )
    mock_response.stubs(:is_a?).with(Net::HTTPSuccess).returns(true)

    Net::HTTP.expects(:get_response).returns(mock_response)

    CheckVersionUpdateJob.perform_now

    @version_checker.reload
    assert_equal "1.0.0", @version_checker.remote_version
    assert @version_checker.checked_at > initial_time
  end

  test "handles malformed version strings" do
    mock_response = stub(
      is_a?: true,
      body: "not-a-version",
    )
    mock_response.stubs(:is_a?).with(Net::HTTPSuccess).returns(true)

    Net::HTTP.expects(:get_response).returns(mock_response)

    # Should still update with whatever is returned
    CheckVersionUpdateJob.perform_now

    @version_checker.reload
    assert_equal "not-a-version", @version_checker.remote_version
  end
end
