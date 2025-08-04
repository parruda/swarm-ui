# frozen_string_literal: true

module ClaudeChatHelper
  def message_classes(role)
    base = "flex gap-3 p-3 rounded-lg"
    case role
    when "user"
      "#{base} bg-blue-50 dark:bg-blue-900/20"
    when "assistant"
      "#{base} bg-gray-50 dark:bg-gray-800/50"
    when "error"
      "#{base} bg-red-50 dark:bg-red-900/20"
    else
      base
    end
  end

  def message_role_label(role)
    case role
    when "user"
      "You"
    when "assistant"
      "Claude"
    when "error"
      "System"
    else
      role.capitalize
    end
  end

  def format_chat_content(content)
    return "" if content.blank?

    # Process code blocks first to protect them from other formatting
    parts = []
    remaining = content.dup

    # Extract and process code blocks
    while remaining =~ /```(\w*)\n?(.*?)```/m
      before = ::Regexp.last_match.pre_match
      ::Regexp.last_match(1)
      code_content = ::Regexp.last_match(2)
      after = ::Regexp.last_match.post_match

      # Add the text before the code block
      parts << format_text_content(before) if before.present?

      # Add the code block
      parts << %(<pre class="bg-gray-900 dark:bg-gray-950 p-4 rounded-lg overflow-x-auto my-3 border border-gray-700 dark:border-gray-600"><code class="text-sm text-gray-100 font-mono whitespace-pre">#{h(code_content.strip)}</code></pre>)

      remaining = after
    end

    # Add any remaining text
    parts << format_text_content(remaining) if remaining.present?

    %(<div class="prose prose-sm dark:prose-invert max-w-none break-words">#{parts.join}</div>).html_safe
  end

  private

  def format_text_content(text)
    return "" if text.blank?

    # Split into paragraphs
    paragraphs = text.strip.split(/\n\n+/)

    formatted_paragraphs = paragraphs.map do |para|
      # Format inline elements
      formatted = h(para)
        .gsub(/\*\*(.*?)\*\*/m, '<strong class="font-semibold">\1</strong>')
        .gsub(/\*(.*?)\*/m, '<em>\1</em>')
        .gsub(/`([^`]+)`/, '<code class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono">\1</code>')
        .gsub("\n", "<br>")

      # Check if this looks like a list item
      if formatted.start_with?(/^\d+\./) || formatted.start_with?(/^[-*]/)
        # Process as list
        items = para.split("\n").map do |item|
          item_formatted = h(item)
            .gsub(/^\d+\.\s*/, "")  # Remove number prefix
            .gsub(/^[-*]\s*/, "")   # Remove bullet prefix
            .gsub(/\*\*(.*?)\*\*/m, '<strong class="font-semibold">\1</strong>')
            .gsub(/\*(.*?)\*/m, '<em>\1</em>')
            .gsub(/`([^`]+)`/, '<code class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono">\1</code>')

          "<li>#{item_formatted}</li>"
        end

        # Determine if ordered or unordered list
        if para.start_with?(/^\d+\./)
          "<ol class='list-decimal list-inside ml-4 my-2 space-y-1'>#{items.join}</ol>"
        else
          "<ul class='list-disc list-inside ml-4 my-2 space-y-1'>#{items.join}</ul>"
        end
      else
        # Regular paragraph
        "<p class='mb-3'>#{formatted}</p>"
      end
    end

    formatted_paragraphs.join
  end
end
