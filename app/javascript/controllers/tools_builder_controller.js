import { Controller } from "@hotwired/stimulus"

// Tools builder controller for managing allowed tools with custom patterns
export default class extends Controller {
  static targets = ["customTool", "toolsList"]
  
  connect() {
    console.log("Tools builder controller connected")
  }
  
  addCustom(event) {
    event.preventDefault()
    
    if (!this.hasCustomToolTarget) return
    
    const value = this.customToolTarget.value.trim()
    
    if (value) {
      const checkbox = document.createElement('label')
      checkbox.className = 'flex items-center'
      checkbox.innerHTML = `
        <input type="checkbox" 
               name="instance_template[allowed_tools][]"
               value="${this.escapeHtml(value)}"
               class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
               checked />
        <span class="ml-2 text-sm text-gray-700">${this.escapeHtml(value)}</span>
      `
      
      // Find the grid container
      const gridContainer = this.element.querySelector('.grid')
      if (gridContainer) {
        gridContainer.appendChild(checkbox)
      }
      
      // Clear the input
      this.customToolTarget.value = ''
    }
  }
  
  // Escape HTML to prevent XSS
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}