import { Controller } from "@hotwired/stimulus"

// MCP builder controller for managing MCP server configurations
export default class extends Controller {
  connect() {
    console.log("MCP builder controller connected")
  }
  
  add(event) {
    event.preventDefault()
    
    const template = `
      <div class="border border-gray-300 p-4 rounded-md mb-3 bg-gray-50" data-mcp-builder-target="item">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" 
                   name="instance[mcps][][name]"
                   placeholder="MCP server name"
                   class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select name="instance[mcps][][type]" 
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm">
              <option value="stdio">stdio</option>
              <option value="sse">sse</option>
            </select>
          </div>
          
          <div class="sm:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Command (for stdio)</label>
            <input type="text"
                   name="instance[mcps][][command]"
                   placeholder="mcp-server-sqlite"
                   class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
          </div>
          
          <div class="sm:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">Arguments</label>
            <input type="text"
                   name="instance[mcps][][args]"
                   placeholder="-d ./data.db (comma-separated)"
                   class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
          </div>
          
          <div class="sm:col-span-2">
            <label class="block text-sm font-medium text-gray-700 mb-1">URL (for sse)</label>
            <input type="text"
                   name="instance[mcps][][url]"
                   placeholder="http://localhost:3000/sse"
                   class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
          </div>
        </div>
        
        <button type="button"
                class="mt-3 inline-flex items-center rounded-md bg-red-50 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
                data-action="click->mcp-builder#removeMcp">
          Remove MCP Server
        </button>
      </div>
    `
    
    this.element.insertAdjacentHTML('beforeend', template)
  }
  
  removeMcp(event) {
    event.preventDefault()
    event.target.closest('[data-mcp-builder-target="item"]').remove()
  }
}