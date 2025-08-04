import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["providerSelect", "modelField", "openaiFields", "vibeCheckbox", "worktreeField", "toolsSection"]
  
  connect() {
    this.updateFormFields()
  }
  
  providerChanged() {
    this.updateFormFields()
  }
  
  vibeChanged() {
    this.updateFormFields()
  }
  
  selectAllTools() {
    const checkboxes = this.toolsSectionTarget.querySelectorAll('input[type="checkbox"]')
    checkboxes.forEach(cb => cb.checked = true)
  }
  
  clearAllTools() {
    const checkboxes = this.toolsSectionTarget.querySelectorAll('input[type="checkbox"]')
    checkboxes.forEach(cb => cb.checked = false)
  }
  
  updateFormFields() {
    const isOpenAI = this.providerSelectTarget.value === 'openai'
    const isVibe = this.vibeCheckboxTarget.checked
    
    // Show/hide OpenAI fields
    if (this.hasOpenaiFieldsTarget) {
      this.openaiFieldsTarget.classList.toggle('hidden', !isOpenAI)
    }
    
    // Show/hide worktree (hidden for OpenAI)
    if (this.hasWorktreeFieldTarget) {
      this.worktreeFieldTarget.classList.toggle('hidden', isOpenAI)
    }
    
    // Show/hide tools section (hidden for vibe or OpenAI)
    if (this.hasToolsSectionTarget) {
      this.toolsSectionTarget.classList.toggle('hidden', isVibe || isOpenAI)
    }
    
    // Update vibe checkbox state for OpenAI
    if (this.hasVibeCheckboxTarget) {
      this.vibeCheckboxTarget.checked = isOpenAI || isVibe
      this.vibeCheckboxTarget.disabled = isOpenAI
    }
    
    // Update model field based on provider
    if (this.hasModelFieldTarget) {
      const currentModel = this.modelFieldTarget.querySelector('input, select').value
      if (isOpenAI) {
        this.modelFieldTarget.innerHTML = `
          <label class="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-100">Model</label>
          <input type="text" name="instance_template[config][model]" value="${currentModel}" 
                 placeholder="e.g., gpt-4o, o1, o3-mini"
                 class="block w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm focus:outline-none focus:border-orange-500 dark:focus:border-orange-400 focus:ring-1 focus:ring-orange-500 dark:focus:ring-orange-400 sm:text-sm sm:leading-6 transition-colors duration-200">
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Common models: gpt-4o, gpt-4o-mini, o1, o1-mini, o3-mini</p>
        `
      } else {
        const claudeModels = ['opus', 'sonnet']
        const options = claudeModels.map(m => 
          `<option value="${m}" ${currentModel === m ? 'selected' : ''}>${m}</option>`
        ).join('')
        this.modelFieldTarget.innerHTML = `
          <label class="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-100">Model</label>
          <select name="instance_template[config][model]" 
                  class="block w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 shadow-sm focus:outline-none focus:border-orange-500 dark:focus:border-orange-400 focus:ring-1 focus:ring-orange-500 dark:focus:ring-orange-400 sm:text-sm sm:leading-6 transition-colors duration-200">
            ${options}
          </select>
        `
      }
    }
  }
}