import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["nameInput", "filename", "yamlName"]
  
  connect() {
    // Set initial preview if there's already a value
    if (this.nameInputTarget.value) {
      this.updatePreview()
    }
  }
  
  updatePreview() {
    const name = this.nameInputTarget.value.trim()
    
    if (name) {
      // Generate filename: lowercase, replace spaces with dashes, remove special chars
      const filename = name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_]/g, '')
      
      // Update filename preview (add .yml extension)
      this.filenameTarget.textContent = filename ? `${filename}.yml` : 'swarm-config.yml'
      
      // Update YAML name preview (keep original name)
      this.yamlNameTarget.textContent = name
    } else {
      // Reset to defaults when empty
      this.filenameTarget.textContent = 'swarm-config.yml'
      this.yamlNameTarget.textContent = 'My Awesome Swarm'
    }
  }
}