import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "currentPath", "fileList", "selectedPath", "projectPathInput", "configSelect"]
  static values = { currentPath: String }

  connect() {
    this.currentPathValue = this.currentPathValue || ""
  }

  open() {
    this.modalTarget.classList.remove("hidden")
    this.navigate("~")
  }

  close() {
    this.modalTarget.classList.add("hidden")
  }

  async navigate(path = "") {
    try {
      const response = await fetch(`/filesystem/browse?path=${encodeURIComponent(path)}`)
      const data = await response.json()
      
      this.currentPathValue = data.current_path
      this.currentPathTarget.textContent = data.current_path || "/"
      this.renderFileList(data.entries)
    } catch (error) {
      console.error("Failed to navigate:", error)
    }
  }

  renderFileList(entries) {
    this.fileListTarget.innerHTML = entries.map(entry => `
      <button type="button"
              class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 flex items-center gap-2 transition-colors duration-200"
              data-action="click->filesystem-browser#handleEntryClick"
              data-path="${entry.path}"
              data-is-directory="${entry.is_directory}">
        ${entry.is_directory ? this.folderIcon() : this.fileIcon()}
        <span class="${entry.is_directory ? 'font-medium' : ''}">${entry.name}</span>
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
    this.selectedPathTarget.textContent = this.currentPathValue
    this.projectPathInputTarget.value = this.currentPathValue
    this.close()
    this.scanForSwarmConfigs()
  }

  async scanForSwarmConfigs() {
    if (!this.currentPathValue) return

    try {
      this.configSelectTarget.innerHTML = '<option value="">Scanning for swarm configurations...</option>'
      
      const response = await fetch(`/filesystem/scan_swarm_configs?path=${encodeURIComponent(this.currentPathValue)}`)
      const data = await response.json()
      
      if (data.configs.length > 0) {
        this.configSelectTarget.innerHTML = '<option value="">Select a configuration file</option>'
        data.configs.forEach(config => {
          const option = document.createElement("option")
          option.value = config.path
          option.textContent = config.relative_path
          this.configSelectTarget.appendChild(option)
        })
      } else {
        this.configSelectTarget.innerHTML = '<option value="">No swarm configuration files found</option>'
      }
    } catch (error) {
      console.error("Failed to scan for configs:", error)
      this.configSelectTarget.innerHTML = '<option value="">Error scanning for configurations</option>'
    }
  }

  folderIcon() {
    return `<svg class="w-5 h-5 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
    </svg>`
  }

  fileIcon() {
    return `<svg class="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
    </svg>`
  }
}