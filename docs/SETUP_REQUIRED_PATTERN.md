# SETUP_REQUIRED Error Handling Pattern

## When Backend Returns SETUP_REQUIRED

All AWS service API calls now check for user credentials. If a user hasn't completed setup, the backend returns:

```json
{
  "success": false,
  "error": "Please complete setup first",
  "code": "SETUP_REQUIRED"
}
```

## Frontend Pattern

Add this check after ANY `invokeurl` call to the backend:

```deluge
try {
    apiResponse = invokeurl [
        url: API_URL
        type: POST
        parameters: requestBody.toString()
        headers: {"Content-Type": "application/json"}
        connection: "awscloudcommander"
    ];
    
    info "API Response: " + apiResponse;
    
    // Check for SETUP_REQUIRED error
    if(apiResponse.get("code") == "SETUP_REQUIRED")
    {
        return {
            "text": "⚠️ *Setup Required*\n\nPlease complete your AWS setup first to use this feature.\n\nClick below to get started →",
            "card": {
                "title": "Setup Needed",
                "thumbnail": "https://www.monks.com/data/styles/738x363_crop/s3/2024-12/AWS.png?VersionId=AgciRGgmrM5MOD.WFIdw68QeG8kI.JR.&h=c74750f6&itok=q-7iCrYZ",
                "theme": "prompt"
            },
            "buttons": [
                {
                    "label": "Complete Setup",
                    "action": {
                        "type": "invoke.function",
                        "data": {"name": "setupForm"}
                    },
                    "key": "start_setup"
                }
            ]
        };
    }
    
    // Continue with normal processing
    // ...
    
} catch(e) {
    info "API Error: " + e;
    return {
        "text": "❌ Error: " + e,
        "card": {"title": "Error", "theme": "prompt"}
    };
}
```

## Files That Need This Pattern

All frontend handlers that call the backend:
- `handleButton.ds` (all AWS service button actions)
- `handleForm.ds` (all AWS service form submissions)  
- Command execution handlers in `/aws`, `/ec2`, `/s3`, etc.
- Bot handlers that trigger AWS operations

## Implementation Status

- ✅ Backend: All AWS services check credentials and return SETUP_REQUIRED
- ⚠️ Frontend: Pattern documented - implement as needed when testing reveals missing checks

## Testing

1. Test with a new user who hasn't completed setup
2. Try any AWS command (e.g., `/aws` or click any button)
3. Should see "Setup Required" message with button to start setup
4. After completing setup, retry the command - should work

