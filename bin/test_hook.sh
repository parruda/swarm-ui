#!/usr/bin/env bash

# Run the Rails test suite
bundle exec rails test

# Capture the exit code
TEST_EXIT_CODE=$?

# If tests failed, print the instruction message to stderr
if [ $TEST_EXIT_CODE -ne 0 ]; then
  echo >&2
  echo "Fix the tests that are failing without modifying the app implementation code. If you find that a test you wrote is failing because the app implementation has a bug, leave the test as skipped and write a comment explaining the findings and what needs to be done" >&2
  exit 2
fi

# Exit with success if tests passed
exit 0