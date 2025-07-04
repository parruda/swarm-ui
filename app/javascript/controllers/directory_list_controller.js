import { Controller } from "@hotwired/stimulus"

// Directory list controller for managing multiple directories per instance
export default class extends Controller {
  connect() {
    console.log("Directory list controller connected")
  }

  add(event) {
    event.preventDefault()
    
    const template = `
      <div class="flex gap-2 mb-2" data-directory-list-target="item">
        <input type="text" 
               name="instance[directories][]"
               class="block flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
               placeholder="./path/to/directory" />
        <button type="button" 
                class="inline-flex items-center rounded-md bg-red-50 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
                data-action="click->directory-list#remove">
          Remove
        </button>
      </div>
    `
    
    this.element.insertAdjacentHTML('beforeend', template)
  }
  
  remove(event) {
    event.preventDefault()
    event.target.closest('[data-directory-list-target="item"]').remove()
  }
}