# Deluge Forms Reference Guide
## Zoho Cliq Extension Forms

This document provides a comprehensive reference for all available form input types in Deluge for Zoho Cliq extensions.

---

## ⚠️ CRITICAL SYNTAX RULES

### Rule 1: Use JSON Array Syntax
**Forms MUST use JSON array syntax `[...]` for `inputs` and `options` fields!**

This is different from other Deluge code where `{{...}}` is used for lists.

### ❌ WRONG (causes "Sorry, we couldn't process your request" error):
```deluge
"inputs": {
    {"type": "text", "name": "field1"},
    {"type": "text", "name": "field2"}
}
```

### ✅ CORRECT:
```deluge
"inputs": [
    {"type": "text", "name": "field1"},
    {"type": "text", "name": "field2"}
]
```

### Rule 2: Use `placeholder` NOT `hint` on Inputs
**Input fields must use `placeholder` - NOT `hint`!**

Form-level `hint` works fine, but input-level `hint` causes crashes. Always use `placeholder` instead.

### ❌ WRONG (causes form to crash):
```deluge
{
    "type": "select",
    "name": "region",
    "label": "Region",
    "hint": "Select a region"  // WRONG! This crashes!
}
```

### ✅ CORRECT:
```deluge
{
    "type": "select",
    "name": "region",
    "label": "Region",
    "placeholder": "Select a region"  // CORRECT!
}
```

### Rule 3: Checkbox Requires Options Array
**Checkbox type is for MULTI-SELECT, not boolean!**

Use `toggle` for true/false boolean values. Checkbox requires an `options` array.

### ❌ WRONG (checkbox without options):
```deluge
{
    "type": "checkbox",
    "name": "enabled",
    "label": "Enable",
    "value": true  // WRONG! Checkbox needs options array!
}
```

### ✅ CORRECT (use toggle for boolean):
```deluge
{
    "type": "toggle",
    "name": "enabled",
    "label": "Enable",
    "value": true  // Toggle works with boolean
}
```

### ✅ CORRECT (checkbox with options):
```deluge
{
    "type": "checkbox",
    "name": "features",
    "label": "Select Features",
    "placeholder": "Choose options",
    "options": [
        {"value": "opt1", "label": "Option 1"},
        {"value": "opt2", "label": "Option 2"}
    ]
}
```

---

## Form Structure

```deluge
return {
    "type": "form",
    "title": "Form Title",
    "hint": "Form description shown below title",  // hint OK at form level
    "name": "uniqueFormName",
    "button_label": "Submit Button Text",
    "inputs": [
        // Input fields go here - USE [] NOT {}!
    ],
    "action": {
        "type": "invoke.function",
        "name": "handleForm"
    }
};
```

**IMPORTANT Syntax Notes:**
- Form `inputs` field MUST use JSON array syntax `[...]`
- Select/radio/checkbox `options` field MUST use JSON array syntax `[...]`
- Maps use `{key: value}` or `{"key": "value"}`
- Use `placeholder` on inputs, NOT `hint`

---

## Required Tags Quick Reference

| Type | Required | Optional |
|------|----------|----------|
| text | type, name, label, placeholder | mandatory, value, min_length, max_length, format |
| textarea | type, name, label, placeholder | mandatory, value, min_length, max_length |
| number | type, name, label, placeholder | mandatory, value, min, max |
| select | type, name, label, placeholder, options | mandatory, value |
| radio | type, name, label, placeholder, options | mandatory, value |
| checkbox | type, name, label, placeholder, options | mandatory, max_selections |
| toggle | type, name, label, value | (none - NO placeholder!) |
| date | type, name, label, placeholder | mandatory, value |
| datetime | type, name, label, placeholder | mandatory, value |
| hidden | type, name, value | (none) |
| file | type, name, label, placeholder | mandatory |
| location | type, name, label, placeholder | mandatory |
| dynamic_catalogue | type, name, label, placeholder, options | mandatory |
| native_select | type, name, label, placeholder, data_source | mandatory, multiple |

---

## VERIFIED Working Input Types (All Tested)

These types have been tested and confirmed to work:

### 1. Text Input

Standard single-line text input.

```deluge
{
    "type": "text",
    "name": "fieldName",
    "label": "Field Label",
    "placeholder": "Placeholder text",
    "mandatory": true,
    "value": "default value"
}
```

---

### 2. Number Input

Numeric input with optional min/max.

```deluge
{
    "type": "number",
    "name": "amount",
    "label": "Amount",
    "placeholder": "Enter number",
    "mandatory": false,
    "value": "50",
    "min": "1",
    "max": "100"
}
```

---

### 3. Textarea

Multi-line text input with optional length limits.

```deluge
{
    "type": "textarea",
    "name": "description",
    "label": "Description",
    "placeholder": "Enter your text here...",
    "mandatory": false,
    "min_length": "5",
    "max_length": "500"
}
```

---

### 4. Select (Dropdown)

Single-select dropdown.

```deluge
{
    "type": "select",
    "name": "region",
    "label": "Select Region",
    "placeholder": "Select a region",
    "mandatory": true,
    "value": "us-east-1",
    "options": [
        {"value": "us-east-1", "label": "US East (N. Virginia)"},
        {"value": "us-west-2", "label": "US West (Oregon)"},
        {"value": "eu-west-1", "label": "Europe (Ireland)"},
        {"value": "ap-south-1", "label": "Asia Pacific (Mumbai)"}
    ]
}
```

---

### 5. Toggle

Boolean on/off switch. Use this for true/false values (NOT checkbox).
**NOTE: Toggle does NOT use placeholder!**

```deluge
{
    "type": "toggle",
    "name": "enabled",
    "label": "Enable Feature",
    "value": true
}
```

---

### 6. Radio Buttons

Single selection from multiple options.

```deluge
{
    "type": "radio",
    "name": "severity",
    "label": "Severity Level",
    "placeholder": "Select severity",
    "mandatory": true,
    "options": [
        {"value": "low", "label": "Low"},
        {"value": "medium", "label": "Medium"},
        {"value": "high", "label": "High"}
    ]
}
```

---

### 7. Checkbox (Multi-Select)

Multiple selection from options. **NOT for boolean values - use toggle instead!**

```deluge
{
    "type": "checkbox",
    "name": "features",
    "label": "Select Features",
    "placeholder": "Choose multiple",
    "mandatory": false,
    "max_selections": "2",
    "options": [
        {"value": "opt1", "label": "Option 1"},
        {"value": "opt2", "label": "Option 2"}
    ]
}
```

---

### 8. Date Picker

```deluge
{
    "type": "date",
    "name": "eventDate",
    "label": "Event Date",
    "placeholder": "Choose a date",
    "mandatory": true,
    "value": "2025-11-05"
}
```

---

### 9. Datetime Picker

```deluge
{
    "type": "datetime",
    "name": "eventDateTime",
    "label": "Event Date & Time",
    "placeholder": "Select date and time",
    "mandatory": true
}
```

---

### 10. Hidden Field

Hidden input for passing data (not visible to user).

```deluge
{
    "type": "hidden",
    "name": "userId",
    "value": "user123"
}
```

---

### 11. File Upload

```deluge
{
    "type": "file",
    "name": "attachment",
    "label": "Upload File",
    "placeholder": "Select a file",
    "mandatory": false
}
```

---

### 12. Location Picker

```deluge
{
    "type": "location",
    "name": "meetingPlace",
    "label": "Meeting Location",
    "placeholder": "Choose location",
    "mandatory": false
}
```

---

### 13. Password Field

Text field with password format (masked input).

```deluge
{
    "type": "text",
    "format": "password",
    "name": "secretKey",
    "label": "Password",
    "placeholder": "Enter password",
    "mandatory": true
}
```

---

### 14. Email Field

Text field with email format (validation).

```deluge
{
    "type": "text",
    "format": "email",
    "name": "userEmail",
    "label": "Email Address",
    "placeholder": "Enter email",
    "mandatory": true
}
```

---

### 15. Dynamic Catalogue

Rich selection with images/thumbnails.

```deluge
{
    "type": "dynamic_catalogue",
    "name": "product",
    "label": "Select Product",
    "placeholder": "Choose a product",
    "mandatory": false,
    "options": [
        {
            "value": "item1",
            "label": "Item 1",
            "image": "https://example.com/image1.png"
        },
        {
            "value": "item2",
            "label": "Item 2",
            "image": "https://example.com/image2.png"
        }
    ]
}
```

---

### 16. Native Select (Contacts, Teams, Channels)

Pre-populated from Zoho Cliq data.

```deluge
{
    "type": "native_select",
    "name": "users",
    "label": "Select User",
    "placeholder": "Select users",
    "data_source": "contacts",
    "multiple": false,
    "mandatory": false
}
```

**Available data_source values:**
- `contacts` - Cliq contacts
- `teams` - Cliq teams
- `channels` - Cliq channels

---

## Complete Working Form Examples

### Settings Form Pattern

```deluge
return {
    "type": "form",
    "title": "⚙️ Settings",
    "hint": "Configure your preferences",
    "name": "settingsForm",
    "button_label": "💾 Save Settings",
    "inputs": [
        {
            "type": "select",
            "name": "region",
            "label": "Default Region",
            "placeholder": "Select region",
            "mandatory": true,
            "value": "ap-south-1",
            "options": [
                {"value": "ap-south-1", "label": "Asia Pacific (Mumbai)"},
                {"value": "us-east-1", "label": "US East (N. Virginia)"}
            ]
        },
        {
            "type": "number",
            "name": "threshold",
            "label": "Alert Threshold",
            "placeholder": "Enter threshold value",
            "mandatory": false,
            "value": "50"
        },
        {
            "type": "toggle",
            "name": "alertsEnabled",
            "label": "Enable Notifications",
            "value": true
        }
    ],
    "action": {
        "type": "invoke.function",
        "name": "handleForm"
    }
};
```

### AI Assistant Form Pattern

```deluge
return {
    "type": "form",
    "title": "🤖 AI Assistant",
    "hint": "Ask a question",
    "name": "aiForm",
    "button_label": "🚀 Ask AI",
    "inputs": [
        {
            "type": "select",
            "name": "mode",
            "label": "Mode",
            "placeholder": "Select mode",
            "mandatory": true,
            "value": "general",
            "options": [
                {"value": "general", "label": "💬 General Help"},
                {"value": "troubleshoot", "label": "🔧 Troubleshoot"}
            ]
        },
        {
            "type": "textarea",
            "name": "question",
            "label": "Your Question",
            "placeholder": "Enter your question here...",
            "mandatory": true
        }
    ],
    "action": {
        "type": "invoke.function",
        "name": "handleForm"
    }
};
```

### Incident Report Form Pattern

```deluge
return {
    "type": "form",
    "title": "🚨 Create Incident",
    "hint": "Report a new incident",
    "name": "incidentForm",
    "button_label": "🚨 Create Incident",
    "inputs": [
        {
            "type": "text",
            "name": "title",
            "label": "Incident Title",
            "placeholder": "Brief description of the issue",
            "mandatory": true
        },
        {
            "type": "select",
            "name": "severity",
            "label": "Severity",
            "placeholder": "Select severity level",
            "mandatory": true,
            "options": [
                {"value": "critical", "label": "Critical - Service Down"},
                {"value": "high", "label": "High - Major Impact"},
                {"value": "medium", "label": "Medium - Partial Impact"},
                {"value": "low", "label": "Low - Minor Issue"}
            ]
        },
        {
            "type": "text",
            "name": "resource",
            "label": "Affected Resource",
            "placeholder": "e.g., ec2:i-1234567890abcdef0",
            "mandatory": false
        },
        {
            "type": "textarea",
            "name": "notes",
            "label": "Additional Notes",
            "placeholder": "Any additional information...",
            "mandatory": false
        }
    ],
    "action": {
        "type": "invoke.function",
        "name": "handleForm"
    }
};
```

---

## Processing Form Submissions

In `handleForm.ds`, access submitted values like this:

```deluge
// Get form info
formName = form.get("name");
formValues = form.get("values");

if(formName == "settingsForm")
{
    // Extract values
    region = ifnull(formValues.get("region"), "ap-south-1");
    threshold = ifnull(formValues.get("threshold"), 50);
    alertsEnabled = ifnull(formValues.get("alertsEnabled"), true);

    // Process the form data...
}
```

---

## Best Practices

1. **Always use placeholder on inputs** - Except for toggle and hidden types
2. **Use toggle for boolean** - NOT checkbox (checkbox is for multi-select)
3. **Form-level hint is OK** - Input-level hint crashes the form
4. **Use JSON array syntax** - `[...]` for inputs and options, NOT `{...}`
5. **Provide default values** - Pre-fill with sensible defaults
6. **Set appropriate validation** - Use min/max for numbers, min_length/max_length for text
7. **Limit mandatory fields** - Only require what's truly necessary

---

## Test Forms Reference

Test forms are available via `/aws testforms` command:
- Dashboard 1: Text (1), Form Hint (2), Input Hint (3), Select (4)
- Dashboard 2: Toggle (5), Checkbox (6), Number (7), Number Min/Max (8)
- Dashboard 3: Textarea Min/Max (9), Radio (10), Date (11)
- Dashboard 4: Hidden (12), Combined (13), Datetime (14)
- Dashboard 5: File (15), Location (16), Password (17)
- Dashboard 6: Catalogue (18), Native Select (19), Email (20)

---

*Last Updated: November 2024*
*AWS Cloud Commander - Zoho Cliq Extension*
