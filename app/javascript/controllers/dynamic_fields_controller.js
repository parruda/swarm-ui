import { Controller } from "@hotwired/stimulus"

// Dynamic fields controller for adding/removing form fields
export default class extends Controller {
  static targets = ["field"]
  static values = { template: String }
  
  connect() {
    console.log("Dynamic fields controller connected")
  }

  // Add a new field
  addField(event) {
    event.preventDefault()
    
    if (this.hasTemplateValue) {
      // Insert the template HTML
      this.element.insertAdjacentHTML('beforeend', this.templateValue)
    }
  }

  // Remove a field
  removeField(event) {
    event.preventDefault()
    
    const field = event.target.closest('[data-dynamic-fields-target="field"]')
    if (field) {
      field.remove()
    }
  }
}