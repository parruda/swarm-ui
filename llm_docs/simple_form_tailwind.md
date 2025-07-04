# Using Simple Form with Tailwind CSS

This guide explains how to use Simple Form with Tailwind CSS in this Rails application.

## Configuration

Simple Form has been configured with custom Tailwind wrappers in `config/initializers/simple_form.rb`. The configuration includes:

1. **Default wrapper** (`:tailwind`) - for text inputs, selects, textareas
2. **Boolean wrapper** (`:tailwind_boolean`) - for checkboxes and radio buttons

## Basic Usage

### Text Input
```erb
<%= f.input :name, placeholder: "Enter your name" %>
```

### Email Input
```erb
<%= f.input :email, placeholder: "you@example.com" %>
```

### Password Input
```erb
<%= f.input :password, placeholder: "••••••••" %>
```

### Textarea
```erb
<%= f.input :bio, as: :text, input_html: { rows: 4 } %>
```

### Select/Dropdown
```erb
<%= f.input :role, collection: ["Admin", "Editor", "Viewer"], prompt: "Select a role" %>
```

### Checkbox
```erb
<%= f.input :active, as: :boolean %>
```

### With Hints
```erb
<%= f.input :email, hint: "We'll never share your email" %>
```

## Styling Classes

The Simple Form configuration uses these Tailwind classes:

### Input Fields
- Normal state: `border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500`
- Error state: `border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500`
- Dark mode: `dark:bg-gray-800 dark:border-gray-600 dark:text-white`

### Labels
- `block text-sm font-medium text-gray-700 dark:text-gray-300`

### Hints
- `text-sm text-gray-500 dark:text-gray-400`

### Errors
- `text-sm text-red-600 dark:text-red-400`

### Buttons
- Default submit button: `inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`

## Custom Styling

You can override the default classes for specific inputs:

```erb
<%= f.input :name, 
    input_html: { class: "your-custom-classes" },
    label_html: { class: "your-label-classes" },
    wrapper_html: { class: "your-wrapper-classes" } %>
```

## Form Structure

A typical form structure:

```erb
<%= simple_form_for @model do |f| %>
  <div class="space-y-6">
    <%= f.input :field_name %>
    <%= f.input :another_field %>
  </div>
  
  <div class="flex justify-end space-x-3">
    <button type="button" class="text-gray-500 hover:text-gray-700">Cancel</button>
    <%= f.button :submit %>
  </div>
<% end %>
```

## Complete Example

Here's a comprehensive example showing various form input types styled with Tailwind CSS:

```erb
<div class="max-w-2xl mx-auto bg-white dark:bg-gray-800 shadow rounded-lg p-6">
  <%= simple_form_for @contact, html: { class: "space-y-6" } do |f| %>
    <%= f.input :name, placeholder: "Enter full name" %>
    <%= f.input :email, placeholder: "contact@example.com" %>
    <%= f.input :message, as: :text, input_html: { rows: 4 } %>
    <%= f.input :category, collection: ["General", "Support", "Feedback"], prompt: "Select category" %>
    <%= f.input :urgent, as: :boolean %>
    
    <div class="flex justify-end space-x-3 pt-4">
      <button type="button" class="text-gray-500 hover:text-gray-700">Cancel</button>
      <%= f.button :submit, "Send" %>
    </div>
  <% end %>
</div>
```

## Customization

To modify the default styling, edit the wrappers in `config/initializers/simple_form.rb`. After making changes, restart your Rails server for the changes to take effect.