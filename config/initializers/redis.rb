# frozen_string_literal: true

require "redis"
require "connection_pool"

# Helper class for Redis operations
class RedisClient
  class << self
    def pool
      @pool ||= ConnectionPool.new(size: 10, timeout: 5) do
        Redis.new(url: redis_config["url"])
      end
    end

    def redis_config
      @redis_config ||= Rails.application.config_for(:redis)
    end

    def publish(channel, message)
      pool.with do |redis|
        redis.publish(channel, message)
      end
    end

    def with(&block)
      pool.with(&block)
    end

    def test_connection!
      pool.with do |redis|
        redis.ping
        Rails.logger.info("Redis connected successfully to #{redis_config["url"]}")
      end
    rescue => e
      Rails.logger.error("Redis connection failed: #{e.message}")
      # Don't fail hard if Redis is not available in development
      raise if Rails.env.production?
    end
  end
end

# Test the connection
RedisClient.test_connection!
