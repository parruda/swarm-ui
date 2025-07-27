# frozen_string_literal: true

require "redis"
require "connection_pool"

redis_config = Rails.application.config_for(:redis)

# Create a connection pool for Redis
$redis_pool = ConnectionPool.new(size: 10, timeout: 5) do
  Redis.new(url: redis_config["url"])
end

# Test the connection
begin
  $redis_pool.with do |redis|
    redis.ping
    Rails.logger.info("Redis connected successfully to #{redis_config["url"]}")
  end
rescue => e
  Rails.logger.error("Redis connection failed: #{e.message}")
  # Don't fail hard if Redis is not available in development
  if Rails.env.production?
    raise
  end
end

# Helper class for Redis operations
class RedisClient
  def self.publish(channel, message)
    $redis_pool.with do |redis|
      redis.publish(channel, message)
    end
  end

  def self.with(&block)
    $redis_pool.with(&block)
  end
end
