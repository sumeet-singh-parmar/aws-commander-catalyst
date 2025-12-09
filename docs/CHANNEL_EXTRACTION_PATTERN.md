# Channel Extraction Pattern

When reading `channel` from `awsnotifications` table, it may be stored as:
1. A string (e.g., "awsalerts") - use directly
2. A JSON object string (e.g., `{"unique_name":"awsalerts","name":"#aws-alerts",...}`) - extract `unique_name` or `name`

## Pattern to Use:

```deluge
// Extract channel - ensure it's a string, not an object
channelRaw = ifnull(notifRecord.get("channel"),"");
channelName = "";
if(channelRaw != null)
{
	channelStr = channelRaw.toString();
	if(channelStr.startsWith("{"))
	{
		// It's stored as an object - extract unique_name
		try
		{
			channelObj = channelRaw;
			if(channelObj.get("unique_name") != null)
			{
				channelName = channelObj.get("unique_name").toString();
			}
			else if(channelObj.get("name") != null)
			{
				channelName = channelObj.get("name").toString();
				if(channelName.startsWith("#"))
				{
					channelName = channelName.subString(1);
				}
			}
		}
		catch(e)
		{
			channelName = "";
		}
	}
	else
	{
		channelName = channelStr;
	}
}
```

Apply this pattern everywhere we read `channel` from `awsnotifications` table.

