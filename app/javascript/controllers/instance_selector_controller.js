import { Controller } from "@hotwired/stimulus"

// Connects to data-controller="instance-selector"
export default class extends Controller {
  static targets = ["details"]

  connect() {
    // Show the first instance by default
    this.showFirstInstance()
  }

  selectInstance(event) {
    const selectedInstance = event.target.value
    
    // Hide all instance details
    this.detailsTargets.forEach(detail => {
      detail.classList.add('hidden')
    })
    
    // Show selected instance
    const selectedDetail = document.getElementById(`instance-${selectedInstance}`)
    if (selectedDetail) {
      selectedDetail.classList.remove('hidden')
    }
  }

  showFirstInstance() {
    // Ensure the first instance is visible on load
    if (this.detailsTargets.length > 0) {
      this.detailsTargets[0].classList.remove('hidden')
    }
  }
}