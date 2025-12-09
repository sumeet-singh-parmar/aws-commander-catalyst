# AWS Cloud Commander - Bot

> The conversational interface for AWS Cloud Commander

---

## Overview

The bot (`@awscloudcommander`) provides a natural language interface to AWS. Users can message the bot directly instead of using slash commands.

---

## Bot Handlers

| Handler | File | Trigger |
|---------|------|---------|
| **Welcome** | `WelcomeHandler.ds` | First message to bot |
| **Message** | `MessageHandler.ds` | Any message to bot |
| **Participation** | `ParticipationHandler.ds` | Bot added/removed from channel |

---

## Setup in Zoho Cliq

### Step 1: Create Bot

1. Go to **Cliq** → **Profile Picture** → **Bots & Tools**
2. Navigate to **Bots** → **Create Bot**
3. Fill in details:
   - **Name:** AWS Cloud Commander
   - **Unique Name:** awscloudcommander
   - **Description:** Manage AWS infrastructure from Zoho Cliq
   - **Icon:** Upload AWS-themed icon
   - **Access:** Organization
   - **Channel Participation:** Allow

### Step 2: Add Handlers

#### Welcome Handler

1. Go to **Handlers** → **Welcome Handler**
2. Click **Edit Code**
3. Copy contents from `WelcomeHandler.ds`
4. Paste and Save

#### Message Handler

1. Go to **Handlers** → **Message Handler**
2. Click **Edit Code**
3. Copy contents from `MessageHandler.ds`
4. Paste and Save

#### Participation Handler

1. Go to **Handlers** → **Participation Handler**
2. Click **Edit Code**
3. Copy contents from `ParticipationHandler.ds`
4. Paste and Save

### Step 3: Add Menu Shortcuts (Optional)

The bot supports up to 5 menu shortcuts for quick actions:

1. Go to **Menu** → **+ Add Menu**
2. Add these shortcuts:

| Label | Hint | Handler | Code File |
|-------|------|---------|-----------|
| Dashboard | Open AWS Dashboard | AWS BotDashboard | `bot/DashboardHandler.ds` |
| Create Incident | Report new incident | AWS BotIncident | `bot/IncidentHandler.ds` |
| Settings | Configure preferences | AWS BotSettings | `bot/SettingsHandler.ds` |
| Notifications | Configure notification channels | AWS BotNotificationSettings | `bot/NotificationSettingsHandler.ds` |
| Reset Setup | Restart setup process | AWS BotResetSetup | `bot/ResetSetupHandler.ds` |
| EC2 | View EC2 Instances | `invoke.function\|handleButton\|\|ec2_refresh` | - |
| S3 | View S3 Buckets | `invoke.function\|handleButton\|\|s3_refresh` | - |
| Costs | View Cost Reports | `invoke.function\|handleButton\|\|cost_week` | - |
| Help | Show Help | `invoke.function\|handleButton\|\|help` | - |

#### Setting Up Bot Menu Actions

For actions that require dedicated handlers (Dashboard, Create Incident, Settings, Notifications, Reset Setup):

1. Go to **Interactions** → **+ Add Interaction**
2. Select **Bot Menu Action**
3. Fill in:
   - **Action Name:** Dashboard (or Create Incident, Settings, Notifications, Reset Setup)
   - **Handler:** Select or create handler (e.g., "AWS BotDashboard")
4. Click **Edit Code** and paste the code from the corresponding file:
   - Dashboard: Copy from `bot/DashboardHandler.ds`
   - Create Incident: Copy from `bot/IncidentHandler.ds`
   - Settings: Copy from `bot/SettingsHandler.ds`
   - Notifications: Copy from `bot/NotificationSettingsHandler.ds`
   - Reset Setup: Copy from `bot/ResetSetupHandler.ds`
5. Save the handler

For simple actions (EC2, S3, Costs, Help), use the `invoke.function` format directly in the Action field.

---

## Message Handler - Keyword Routing

The bot understands natural language and routes to appropriate actions:

| Keywords | Action |
|----------|--------|
| `hi`, `hello`, `hey`, `yo`, `sup` | Friendly greeting |
| `help`, `?`, `commands` | Show help |
| `how are you`, `wassup` | Friendly response |
| `bye`, `later`, `cya` | Goodbye message |
| `thanks`, `ty` | You're welcome |
| `joke`, `funny` | Tell a dev joke |
| `ec2`, `instance`, `server` | EC2 operations |
| `s3`, `bucket`, `storage` | S3 operations |
| `cost`, `spend`, `bill` | Cost reports |
| `lambda`, `function` | Lambda operations |
| `rds`, `database` | RDS operations |
| `alarm`, `alert` | CloudWatch alarms |
| `log` | CloudWatch logs |
| `setting`, `config` | Bot Menu → Settings |
| `dashboard`, `overview` | Open dashboard |
| `ai`, `bedrock` | AI assistant |
| `status`, `health` | System status |

### Direct Actions

Users can also perform direct actions:

- `start i-0123456789` → Starts the specified EC2 instance
- `stop i-0123456789` → Stops the specified EC2 instance
- `reboot i-0123456789` → Reboots the specified EC2 instance

---

## Folder Structure

```
bot/
├── WelcomeHandler.ds            # First-time welcome message
├── MessageHandler.ds            # Keyword routing & natural language
├── ParticipationHandler.ds      # Channel add/remove events
├── DashboardHandler.ds          # Bot Menu Action: Dashboard
├── SettingsHandler.ds           # Bot Menu Action: Settings
├── NotificationSettingsHandler.ds # Bot Menu Action: Notifications
├── IncidentHandler.ds           # Bot Menu Action: Create Incident
└── README.md                    # This file
```

---

## Integration with Functions

The bot handlers use `handleButton` function for button actions:

```deluge
{"label": "View EC2", "action": {"type": "invoke.function", "data": {"name": "handleButton"}}, "key": "ec2_refresh"}
```

This ensures consistent behavior between bot and slash commands.

---

## Onboarding (TODO)

Before any action, the bot will check if user has completed onboarding:

```deluge
// TODO: Check onboarding status
// isOnboarded = checkOnboardingStatus(userId);
// if(!isOnboarded) { return showOnboardingPrompt(); }
```

### Onboarding Options (For Judges)

| Option | Description |
|--------|-------------|
| **Option 1** | Deploy your own Catalyst server from GitHub |
| **Option 2** | Provide AWS credentials (Access Key + Secret Key) |
| **Option 3** | Use pre-deployed server + AWS account |

See main documentation for onboarding details (to be implemented).

---

*AWS Cloud Commander - Built for Zoho Cliqtrix Competition 2025*
