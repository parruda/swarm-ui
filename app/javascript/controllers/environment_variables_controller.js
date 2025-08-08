import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["container", "row", "keyInput"]

  add() {
    const timestamp = new Date().getTime()
    const template = `
      <div class="flex gap-2 items-start" data-environment-variables-target="row">
        <input type="text"
               name="project[environment_variables][new_${timestamp}][key]"
               value=""
               placeholder="KEY"
               data-environment-variables-target="keyInput"
               class="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 dark:focus:ring-orange-500 font-mono text-sm">
        <input type="text"
               name="project[environment_variables][new_${timestamp}][value]"
               value=""
               placeholder="VALUE"
               class="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 dark:focus:ring-orange-500 font-mono text-sm">
        <button type="button"
                data-action="click->environment-variables#remove"
                class="inline-flex items-center p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors duration-200">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `

    this.containerTarget.insertAdjacentHTML("beforeend", template)

    // Focus on the new key input
    const newRow = this.containerTarget.lastElementChild
    const keyInput = newRow.querySelector('[data-environment-variables-target="keyInput"]')
    if (keyInput) {
      keyInput.focus()
    }
  }

  remove(event) {
    const row = event.currentTarget.closest('[data-environment-variables-target="row"]')
    if (row) {
      row.remove()
    }
  }
}