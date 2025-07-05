import { Controller } from "@hotwired/stimulus"

// Handles loading configuration files when directory changes
export default class extends Controller {
  static targets = ["directoryInput", "configSelect", "configFileField"]
  
  connect() {
    console.log("Configuration loader controller connected")
  }

  // Called when directory path changes
  directoryChanged(event) {
    const directoryPath = event.target.value
    
    if (directoryPath && directoryPath.length > 0) {
      this.loadConfigFiles(directoryPath)
    } else {
      this.clearConfigFiles()
    }
  }

  // Load configuration files from directory
  async loadConfigFiles(directoryPath) {
    try {
      const response = await fetch(`/api/sessions/discover?directory_path=${encodeURIComponent(directoryPath)}`, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        this.updateConfigSelect(data.data.config_files || [])
      } else {
        console.error('Failed to load config files')
        this.clearConfigFiles()
      }
    } catch (error) {
      console.error('Error loading config files:', error)
      this.clearConfigFiles()
    }
  }

  // Update the config file select dropdown
  updateConfigSelect(configFiles) {
    const select = this.configSelectTarget
    
    // Clear existing options
    select.innerHTML = '<option value="">Select a configuration file</option>'
    
    // Add new options
    configFiles.forEach(file => {
      const option = document.createElement('option')
      option.value = file.path
      option.textContent = file.name || file.path
      select.appendChild(option)
    })
    
    // Show the field if there are config files
    if (configFiles.length > 0) {
      this.configFileFieldTarget.classList.remove('hidden')
      
      // Auto-select if only one file
      if (configFiles.length === 1) {
        select.selectedIndex = 1
      }
    }
  }

  // Clear the config file dropdown
  clearConfigFiles() {
    const select = this.configSelectTarget
    select.innerHTML = '<option value="">Select a configuration file</option>'
  }
}