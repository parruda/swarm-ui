import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="instance-form"
export default class extends Controller {
  static targets = ["providerSelect"]

  connect() {
    this.toggleProviderFields()
  }

  toggleProviderFields() {
    const provider = this.providerSelectTarget.value
    const temperatureField = this.element.querySelector('[data-provider-field="temperature"]')
    const allowedToolsSection = this.element.querySelector('[data-provider-field="allowed-tools"]')
    
    if (provider === 'claude') {
      // Claude settings
      temperatureField.style.display = 'none'
      allowedToolsSection.style.display = 'block'
      
      // Clear temperature value for Claude
      const temperatureInput = temperatureField.querySelector('input')
      if (temperatureInput) {
        temperatureInput.value = ''
      }
    } else if (provider === 'openai') {
      // OpenAI settings
      temperatureField.style.display = 'block'
      allowedToolsSection.style.display = 'none'
      
      // Check all tools for OpenAI (all tools are allowed)
      const toolCheckboxes = allowedToolsSection.querySelectorAll('input[type="checkbox"]')
      toolCheckboxes.forEach(checkbox => {
        checkbox.checked = true
      })
    }
  }
}