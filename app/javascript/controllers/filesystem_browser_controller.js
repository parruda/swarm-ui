import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "currentPath", "fileList", "selectedPath", "projectPathInput", "configSelect", "configSection", "projectSelect"]
  static values = { currentPath: String }

  connect() {
    this.currentPathValue = this.currentPathValue || ""

    // If we're on a project form and project path is already filled
    if (this.hasProjectPathInputTarget && this.projectPathInputTarget.value && this.hasConfigSelectTarget) {
      this.currentPathValue = this.projectPathInputTarget.value
      this.scanForSwarmConfigs()
    }

    // If we're on a session form with a pre-selected project
    if (this.hasProjectSelectTarget && this.projectSelectTarget.value && this.hasConfigSelectTarget) {
      // Trigger project changed to load configs
      this.projectChanged({ target: this.projectSelectTarget })
    }

    // Focus on name field if requested
    const nameField = document.querySelector('[data-focus-on-load="true"]')
    if (nameField) {
      nameField.focus()
    }
  }

  open() {
    this.modalTarget.classList.remove("hidden")
    // Force reflow to enable transition
    this.modalTarget.offsetHeight
    // Add transition classes
    this.modalTarget.querySelector('[data-action="click->filesystem-browser#close"]').classList.add("opacity-100")
    this.modalTarget.querySelector('.relative.transform').classList.add("opacity-100", "translate-y-0", "scale-100")
    this.modalTarget.querySelector('.relative.transform').classList.remove("opacity-0", "translate-y-4", "scale-95")
    this.navigate("~")
  }

  close() {
    // Add transition classes
    this.modalTarget.querySelector('[data-action="click->filesystem-browser#close"]').classList.remove("opacity-100")
    this.modalTarget.querySelector('.relative.transform').classList.remove("opacity-100", "translate-y-0", "scale-100")
    this.modalTarget.querySelector('.relative.transform').classList.add("opacity-0", "translate-y-4", "scale-95")

    // Hide after transition
    setTimeout(() => {
      this.modalTarget.classList.add("hidden")
    }, 200)
  }

  async navigate(path = "") {
    try {
      // Show loading state
      this.fileListTarget.innerHTML = `
        <div class="flex items-center justify-center py-12">
          <div class="flex items-center gap-3 text-gray-500 dark:text-gray-400">
            <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="text-sm font-medium">Loading...</span>
          </div>
        </div>
      `

      const response = await fetch(`/filesystem/browse?path=${encodeURIComponent(path)}`)
      const data = await response.json()

      this.currentPathValue = data.current_path
      this.currentPathTarget.textContent = data.current_path || "/"
      this.renderFileList(data.entries)
    } catch (error) {
      console.error("Failed to navigate:", error)
      this.fileListTarget.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <svg class="h-12 w-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-sm font-medium">Failed to load directory</p>
          <p class="text-xs mt-1">Please try again</p>
        </div>
      `
    }
  }

  renderFileList(entries) {
    if (entries.length === 0) {
      this.fileListTarget.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <svg class="h-12 w-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
          </svg>
          <p class="text-sm font-medium">Empty directory</p>
          <p class="text-xs mt-1">No subdirectories found</p>
        </div>
      `
      return
    }

    this.fileListTarget.innerHTML = entries.map(entry => `
      <button type="button"
              class="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center gap-3 transition-all duration-150 group"
              data-action="click->filesystem-browser#handleEntryClick"
              data-path="${entry.path}"
              data-is-directory="${entry.is_directory}">
        <span class="flex-shrink-0">
          ${entry.is_directory ? this.folderIcon() : this.fileIcon()}
        </span>
        <span class="${entry.is_directory ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}">${entry.name}</span>
        ${entry.is_directory ? '<span class="ml-auto text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">' + this.chevronRightIcon() + '</span>' : ''}
      </button>
    `).join("")
  }

  handleEntryClick(event) {
    const button = event.currentTarget
    const path = button.dataset.path
    const isDirectory = button.dataset.isDirectory === "true"

    if (isDirectory) {
      this.navigate(path)
    }
  }

  goUp() {
    const parentPath = this.currentPathValue.split("/").slice(0, -1).join("/")
    this.navigate(parentPath)
  }

  selectCurrentDirectory() {
    // Update the displayed path
    this.selectedPathTarget.innerHTML = `<span class="text-gray-700 dark:text-gray-300">${this.currentPathValue}</span>`
    // Update the hidden input value
    this.projectPathInputTarget.value = this.currentPathValue
    this.close()

    // Enable config select and scan for configs
    if (this.hasConfigSelectTarget) {
      this.configSelectTarget.disabled = false
      this.configSelectTarget.classList.remove('opacity-50', 'cursor-not-allowed')
      this.scanForSwarmConfigs()
    }
  }

  async scanForSwarmConfigs() {
    if (!this.currentPathValue) return

    try {
      this.configSelectTarget.innerHTML = '<option value="">Scanning for swarm configurations...</option>'

      const response = await fetch(`/filesystem/scan_swarm_configs?path=${encodeURIComponent(this.currentPathValue)}`)
      const data = await response.json()

      if (data.configs.length > 0) {
        this.configSelectTarget.innerHTML = '<option value="">Select a swarm configuration file</option>'
        data.configs.forEach(config => {
          const option = document.createElement("option")
          option.value = config.path
          option.textContent = config.relative_path
          this.configSelectTarget.appendChild(option)
        })

        // If there's a prefilled configuration path, select it
        const currentValue = this.configSelectTarget.dataset.currentValue || this.configSelectTarget.value
        if (currentValue) {
          this.configSelectTarget.value = currentValue
        }

        // Update hint text
        if (this.hasConfigSectionTarget) {
          const hint = this.configSectionTarget.querySelector('p.text-gray-500')
          if (hint) {
            hint.textContent = 'Automatically detected swarm configuration files'
          }
        }
      } else {
        this.configSelectTarget.innerHTML = '<option value="">No swarm configuration files found</option>'

        // Update hint text
        if (this.hasConfigSectionTarget) {
          const hint = this.configSectionTarget.querySelector('p.text-gray-500')
          if (hint) {
            hint.textContent = 'No swarm configuration files found in the selected directory'
          }
        }
      }
    } catch (error) {
      console.error("Failed to scan for configs:", error)
      this.configSelectTarget.innerHTML = '<option value="">Error scanning for configurations</option>'
    }
  }

  folderIcon() {
    return `<svg class="w-5 h-5 text-orange-500 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
    </svg>`
  }

  fileIcon() {
    return `<svg class="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
    </svg>`
  }

  chevronRightIcon() {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
    </svg>`
  }

  async projectChanged(event) {
    const projectId = event.target.value

    if (!projectId) {
      // No project selected
      this.configSelectTarget.disabled = true
      this.configSelectTarget.classList.add('opacity-50', 'cursor-not-allowed')
      this.configSelectTarget.innerHTML = '<option value="">Select a project first</option>'

      // Update hint text
      if (this.hasConfigSectionTarget) {
        const hint = this.configSectionTarget.querySelector('p.text-gray-500')
        if (hint) {
          hint.textContent = 'Configuration files will be detected after selecting a project'
        }
      }
      return
    }

    try {
      // Enable the select
      this.configSelectTarget.disabled = false
      this.configSelectTarget.classList.remove('opacity-50', 'cursor-not-allowed')
      this.configSelectTarget.innerHTML = '<option value="">Loading project information...</option>'

      // Fetch project details to get the path and default config
      const response = await fetch(`/projects/${projectId}.json`)
      const project = await response.json()

      if (project && project.path) {
        this.currentPathValue = project.path

        // Store the default config path
        const defaultConfigPath = project.default_config_path

        // Scan for configs
        await this.scanForSwarmConfigs()

        // Check if there's a pre-selected value from data-current-value (e.g., from visual builder launch)
        const currentValue = this.configSelectTarget.dataset.currentValue

        if (currentValue) {
          // Use the pre-selected value
          const options = Array.from(this.configSelectTarget.options)
          const matchingOption = options.find(opt => opt.value === currentValue || opt.value.endsWith(`/${currentValue}`))

          if (matchingOption) {
            this.configSelectTarget.value = matchingOption.value
          }
        } else if (defaultConfigPath) {
          // Otherwise, use the project's default config if it exists
          const options = Array.from(this.configSelectTarget.options)
          const defaultOption = options.find(opt => opt.value === defaultConfigPath || opt.value.endsWith(`/${defaultConfigPath}`))

          if (defaultOption) {
            this.configSelectTarget.value = defaultOption.value
          }
        }
      }
    } catch (error) {
      console.error("Failed to load project:", error)
      this.configSelectTarget.innerHTML = '<option value="">Error loading project</option>'
    }
  }
}