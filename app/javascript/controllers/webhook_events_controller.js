import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  selectAll() {
    this.checkboxes.forEach(checkbox => checkbox.checked = true)
  }

  deselectAll() {
    this.checkboxes.forEach(checkbox => checkbox.checked = false)
  }

  get checkboxes() {
    return this.element.querySelectorAll('input[type="checkbox"]')
  }
}