import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="instance-form"
export default class extends Controller {
  static targets = ["providerSelect", "vibeCheckbox"]

  connect() {
    this.toggleProviderFields()
  }

  toggleProviderFields() {
    const provider = this.providerSelectTarget.value
    const temperatureField = this.element.querySelector('[data-provider-field="temperature"]')
    const allowedToolsSection = this.element.querySelector('[data-provider-field="allowed-tools"]')
    const vibeCheckbox = this.element.querySelector('[data-provider-field="vibe-mode"] input[type="checkbox"]')
    const vibeModeField = this.element.querySelector('[data-provider-field="vibe-mode"]')
    const vibeMode = vibeCheckbox ? vibeCheckbox.checked : false
    
    if (provider === 'claude') {
      // Claude settings
      temperatureField.style.display = 'none'
      // Show/hide allowed tools based on vibe mode
      allowedToolsSection.style.display = vibeMode ? 'none' : 'block'
      
      // Clear temperature value for Claude
      const temperatureInput = temperatureField.querySelector('input')
      if (temperatureInput) {
        temperatureInput.value = ''
      }
      
      // Enable vibe mode checkbox for Claude
      if (vibeCheckbox) {
        vibeCheckbox.disabled = false
        vibeCheckbox.classList.remove('opacity-50', 'cursor-default')
        const label = vibeCheckbox.closest('label')
        if (label) {
          label.classList.remove('cursor-default')
          label.classList.add('cursor-pointer')
          const helpText = label.querySelector('p')
          if (helpText) {
            helpText.textContent = 'When enabled, this instance skips all permissions and has access to all available tools'
          }
        }
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
      
      // OpenAI is always vibe mode
      if (vibeCheckbox) {
        vibeCheckbox.checked = true
        vibeCheckbox.disabled = true
        vibeCheckbox.classList.add('opacity-50', 'cursor-default')
        const label = vibeCheckbox.closest('label')
        if (label) {
          label.classList.remove('cursor-pointer')
          label.classList.add('cursor-default')
          const helpText = label.querySelector('p')
          if (helpText) {
            helpText.textContent = 'OpenAI instances are always in vibe mode with access to all tools'
          }
        }
      }
    }
  }
  
  toggleVibeMode(event) {
    const isChecked = event.target.checked
    const allowedToolsSection = this.element.querySelector('[data-provider-field="allowed-tools"]')
    
    if (allowedToolsSection) {
      allowedToolsSection.style.display = isChecked ? 'none' : 'block'
    }
  }
}