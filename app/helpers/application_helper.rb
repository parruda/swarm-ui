# frozen_string_literal: true

module ApplicationHelper
  def log_entry_class(event_type)
    case event_type
    when "request"
      "bg-gradient-to-r from-blue-900/20 to-blue-950/20 border-blue-700/50 shadow-lg hover:shadow-blue-900/20 hover:border-blue-600/50"
    when "result"
      "bg-gradient-to-r from-emerald-900/20 to-emerald-950/20 border-emerald-700/50 shadow-lg hover:shadow-emerald-900/20 hover:border-emerald-600/50"
    when "error"
      "bg-gradient-to-r from-red-900/20 to-red-950/20 border-red-700/50 shadow-lg hover:shadow-red-900/20 hover:border-red-600/50"
    else
      "bg-gradient-to-r from-stone-800/50 to-stone-900/50 border-stone-700/50 shadow-md hover:shadow-lg hover:border-stone-600/50"
    end
  end

  def instance_color(instance)
    colors = [
      "text-blue-400",
      "text-emerald-400",
      "text-purple-400",
      "text-orange-400",
      "text-pink-400",
      "text-yellow-400"
    ]
    
    # Simple hash to consistently color instances
    hash = instance.to_s.chars.map(&:ord).sum
    colors[hash % colors.length]
  end
end
