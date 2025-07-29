# frozen_string_literal: true

# Pagy initializer file (6.0.0)
# Customize only what you really need and notice that the core Pagy works also without any of the following lines.
# Should you think that you need this file to be reloaded, please set the correct require_paths in the Gemfile.

# Pagy DEFAULT AND EXTRAS VARIABLES
# See https://ddnexus.github.io/pagy/docs/api/pagy#configuration
Pagy::DEFAULT[:limit] = 12 # default items per page
Pagy::DEFAULT[:size] = 9   # nav bar links
# Better user experience handled automatically
Pagy::DEFAULT[:overflow] = :last_page

# Extras
# See https://ddnexus.github.io/pagy/docs/extras
require "pagy/extras/overflow"

# When you are done setting your own default freeze it, so it will not get changed accidentally
Pagy::DEFAULT.freeze
