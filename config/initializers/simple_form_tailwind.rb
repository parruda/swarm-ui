# frozen_string_literal: true

# Use this setup block to configure all options available in SimpleForm with Tailwind CSS.
SimpleForm.setup do |config|
  # Default wrapper for most inputs
  config.wrappers :tailwind, tag: 'div', class: 'mb-4' do |b|
    b.use :html5
    b.use :placeholder
    b.optional :maxlength
    b.optional :minlength
    b.optional :pattern
    b.optional :min_max
    b.optional :readonly
    b.use :label, class: 'block text-sm font-medium text-gray-700 mb-1'
    b.use :input, class: 'block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm', 
                  error_class: 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
    b.use :full_error, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-red-600' }
    b.use :hint, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-gray-500' }
  end

  # Wrapper for boolean inputs (checkboxes)
  config.wrappers :tailwind_boolean, tag: 'div', class: 'mb-4' do |b|
    b.use :html5
    b.optional :readonly
    b.wrapper tag: 'div', class: 'flex items-start' do |bb|
      bb.use :input, class: 'h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5'
      bb.use :label, class: 'ml-2 block text-sm text-gray-900'
    end
    b.use :full_error, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-red-600' }
    b.use :hint, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-gray-500 ml-6' }
  end

  # Wrapper for radio buttons and checkboxes in collections
  config.wrappers :tailwind_collection, tag: 'div', class: 'mb-4' do |b|
    b.use :html5
    b.optional :readonly
    b.use :label, class: 'block text-sm font-medium text-gray-700 mb-2'
    b.wrapper tag: 'div', class: 'space-y-2' do |bb|
      bb.use :input, class: 'h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500',
                     item_wrapper_class: 'flex items-center',
                     item_label_class: 'ml-2 block text-sm text-gray-900'
    end
    b.use :full_error, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-red-600' }
    b.use :hint, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-gray-500' }
  end

  # Wrapper for file inputs
  config.wrappers :tailwind_file, tag: 'div', class: 'mb-4' do |b|
    b.use :html5
    b.use :placeholder
    b.optional :maxlength
    b.optional :minlength
    b.optional :readonly
    b.use :label, class: 'block text-sm font-medium text-gray-700 mb-1'
    b.use :input, class: 'block w-full text-sm text-gray-900 border border-gray-300 rounded-md cursor-pointer bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-blue-500',
                  error_class: 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500'
    b.use :full_error, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-red-600' }
    b.use :hint, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-gray-500' }
  end

  # Wrapper for select inputs
  config.wrappers :tailwind_select, tag: 'div', class: 'mb-4' do |b|
    b.use :html5
    b.use :placeholder
    b.optional :readonly
    b.use :label, class: 'block text-sm font-medium text-gray-700 mb-1'
    b.use :input, class: 'block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm',
                  error_class: 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500'
    b.use :full_error, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-red-600' }
    b.use :hint, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-gray-500' }
  end

  # Wrapper for text areas
  config.wrappers :tailwind_text, tag: 'div', class: 'mb-4' do |b|
    b.use :html5
    b.use :placeholder
    b.optional :maxlength
    b.optional :minlength
    b.optional :readonly
    b.use :label, class: 'block text-sm font-medium text-gray-700 mb-1'
    b.use :input, class: 'block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm',
                  error_class: 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
    b.use :full_error, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-red-600' }
    b.use :hint, wrap_with: { tag: 'p', class: 'mt-1 text-sm text-gray-500' }
  end

  # Custom wrapper for inline forms
  config.wrappers :tailwind_inline, tag: 'div', class: 'flex items-center space-x-3' do |b|
    b.use :html5
    b.use :placeholder
    b.optional :maxlength
    b.optional :minlength
    b.optional :pattern
    b.optional :min_max
    b.optional :readonly
    b.use :label, class: 'text-sm font-medium text-gray-700'
    b.use :input, class: 'rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm',
                  error_class: 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
  end

  # Set default wrapper
  config.default_wrapper = :tailwind

  # Custom mappings for specific input types
  config.wrapper_mappings = {
    check_boxes: :tailwind_collection,
    radio_buttons: :tailwind_collection,
    file: :tailwind_file,
    boolean: :tailwind_boolean,
    select: :tailwind_select,
    text: :tailwind_text
  }

  # CSS classes for buttons
  config.button_class = 'inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'

  # CSS class to add for error notification helper
  config.error_notification_class = 'rounded-md bg-red-50 p-4 mb-4'

  # Default class for forms
  config.default_form_class = 'space-y-6'

  # Custom inputs discovery
  config.custom_inputs_namespaces << "SimpleForm::Tailwind::Inputs"
end

# Custom form builder class for additional Tailwind styling if needed
module SimpleForm
  module Tailwind
    class FormBuilder < SimpleForm::FormBuilder
      # Override button method to add Tailwind classes
      def button(type, *args, &block)
        options = args.extract_options!.dup
        options[:class] = [options[:class], button_class(type)].compact.join(' ')
        args << options
        super(type, *args, &block)
      end

      private

      def button_class(type)
        case type
        when :submit
          'inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
        when :cancel
          'inline-flex justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
        else
          'inline-flex justify-center rounded-md border border-transparent bg-gray-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'
        end
      end
    end
  end
end