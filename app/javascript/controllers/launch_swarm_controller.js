import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    templateId: Number,
    requiredVars: Array
  }

  open(event) {
    event.preventDefault()

    // Find or create modal container
    let modalContainer = document.getElementById('launch-swarm-modal')
    if (!modalContainer) {
      modalContainer = document.createElement('div')
      modalContainer.id = 'launch-swarm-modal'
      document.body.appendChild(modalContainer)
    }

    // Check if there are required variables
    if (this.requiredVarsValue && this.requiredVarsValue.length > 0) {
      this.renderVariablesModal(modalContainer)
    } else {
      // No variables required, launch directly
      this.launch({})
    }
  }

  renderVariablesModal(container) {
    const modalHTML = `
      <div class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

        <div class="fixed inset-0 z-50 overflow-y-auto">
          <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div class="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
              <div>
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900">
                  <svg class="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
                  </svg>
                </div>
                <div class="mt-3 text-center sm:mt-5">
                  <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100" id="modal-title">Environment Variables</h3>
                  <div class="mt-2">
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      This swarm template requires environment variables. Please provide values or use the defaults.
                    </p>
                  </div>
                </div>
              </div>

              <div class="mt-5">
                <div class="space-y-4" id="variables-form">
                  ${this.requiredVarsValue.map(varName => `
                    <div>
                      <label for="var_${varName}" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        ${varName}
                      </label>
                      <input type="text"
                             name="var_${varName}"
                             id="var_${varName}"
                             data-var-name="${varName}"
                             placeholder="Enter value or leave blank for default"
                             class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm">
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                <button type="button"
                        id="launch-with-vars"
                        class="inline-flex w-full justify-center rounded-md bg-orange-900 dark:bg-orange-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-800 dark:hover:bg-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-900 dark:focus-visible:outline-orange-900 sm:col-start-2">
                  Launch Session
                </button>
                <button type="button"
                        id="cancel-launch"
                        class="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 sm:col-start-1 sm:mt-0">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `

    container.innerHTML = modalHTML

    // Add event listeners
    document.getElementById('launch-with-vars').addEventListener('click', () => {
      this.launchWithVariables()
    })

    document.getElementById('cancel-launch').addEventListener('click', () => {
      this.closeModal()
    })
  }

  launchWithVariables() {
    const variables = {}
    const inputs = document.querySelectorAll('#variables-form input')

    inputs.forEach(input => {
      const varName = input.dataset.varName
      if (input.value.trim()) {
        variables[varName] = input.value.trim()
      }
    })

    this.launch(variables)
  }

  launch(environmentVariables) {
    // Create form data
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `/swarm_templates/${this.templateIdValue}/launch_session`

    // Add CSRF token
    const csrfToken = document.querySelector('meta[name="csrf-token"]').content
    const tokenInput = document.createElement('input')
    tokenInput.type = 'hidden'
    tokenInput.name = 'authenticity_token'
    tokenInput.value = csrfToken
    form.appendChild(tokenInput)

    // Add environment variables
    Object.keys(environmentVariables).forEach(key => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = `environment_variables[${key}]`
      input.value = environmentVariables[key]
      form.appendChild(input)
    })

    // Submit form
    document.body.appendChild(form)
    form.submit()
  }

  closeModal() {
    const modal = document.getElementById('launch-swarm-modal')
    if (modal) {
      modal.innerHTML = ''
    }
  }
}