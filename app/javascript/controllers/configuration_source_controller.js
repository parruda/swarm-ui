import { Controller } from "@hotwired/stimulus"

// Handles showing/hiding configuration fields based on source selection
export default class extends Controller {
  static targets = ["configFileField", "savedConfigField"]
  
  connect() {
    // Check initial state
    this.updateFields()
  }
  
  // Handle configuration source change
  sourceChanged() {
    this.updateFields()
  }
  
  // Update field visibility based on selected source
  updateFields() {
    const selectedSource = this.element.querySelector('input[name="configuration_source"]:checked')?.value
    
    if (!selectedSource) return
    
    switch(selectedSource) {
      case 'file':
        this.showConfigFileField()
        this.hideSavedConfigField()
        break
      case 'saved':
        this.hideConfigFileField()
        this.showSavedConfigField()
        break
      default: // 'new' or any other value
        this.hideConfigFileField()
        this.hideSavedConfigField()
    }
  }
  
  showConfigFileField() {
    if (this.hasConfigFileFieldTarget) {
      this.configFileFieldTarget.classList.remove('hidden')
    }
  }
  
  hideConfigFileField() {
    if (this.hasConfigFileFieldTarget) {
      this.configFileFieldTarget.classList.add('hidden')
    }
  }
  
  showSavedConfigField() {
    if (this.hasSavedConfigFieldTarget) {
      this.savedConfigFieldTarget.classList.remove('hidden')
    }
  }
  
  hideSavedConfigField() {
    if (this.hasSavedConfigFieldTarget) {
      this.savedConfigFieldTarget.classList.add('hidden')
    }
  }
}