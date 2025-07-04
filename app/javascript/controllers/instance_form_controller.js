import { Controller } from "@hotwired/stimulus"

// Instance form controller for showing/hiding provider-specific fields
export default class extends Controller {
  connect() {
    console.log("Instance form controller connected")
    
    // Check initial state
    const providerSelect = this.element.querySelector('select[name*="[provider]"]')
    if (providerSelect) {
      this.updateProviderFields(providerSelect.value)
    }
  }
  
  updateProvider(event) {
    const provider = event.target.value
    this.updateProviderFields(provider)
  }
  
  updateProviderFields(provider) {
    const claudeFields = document.getElementById('claude-fields')
    const openaiFields = document.getElementById('openai-fields')
    
    if (!claudeFields || !openaiFields) return
    
    if (provider === 'openai') {
      claudeFields.classList.add('hidden')
      openaiFields.classList.remove('hidden')
    } else {
      claudeFields.classList.remove('hidden')
      openaiFields.classList.add('hidden')
    }
  }
}