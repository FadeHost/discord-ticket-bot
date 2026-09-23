# FadeHost Ticket Bot

Support tickets for your Discord server: a button opens a private channel for the member, your support role sees it, and a transcript lands in a log channel when it closes.

## Setup on FadeHost
1. Create a bot at https://discord.com/developers/applications: New Application, Bot, Reset Token.
2. Invite it with the `bot` and `applications.commands` scopes and the **Manage Channels**, **Manage Roles** (to set channel permissions), **Send Messages**, **Read Message History** and **Attach Files** permissions.
3. In your FadeHost panel, deploy the **Ticket Bot** template and paste the token as `DISCORD_TOKEN`.
4. In Discord, run `/ticket-setup` with the category tickets open in, the support role and the log channel, then `/ticket-panel` in the channel where members should press the button.

## Commands
| Command | What it does |
|---|---|
| `/ticket-setup category role [log] [message]` | Where tickets open, who sees them, where transcripts go, the first message in a ticket. |
| `/ticket-panel [text]` | Posts the "Open a ticket" button in the current channel. |
| `/ticket-add user` | Lets someone else see the current ticket. |
| `/ticket-close` | Closes the current ticket (the button in the ticket does the same). |

## Environment variables
| Variable | Default | What it does |
|---|---|---|
| `DISCORD_TOKEN` | | **Required.** Your bot token. |
| `TICKET_CATEGORY_ID` | | Optional default category (or use `/ticket-setup`). |
| `SUPPORT_ROLE_ID` | | Optional default support role. |
| `LOG_CHANNEL_ID` | | Optional default transcript channel. |
| `TICKET_MESSAGE` | | Optional first message in every ticket. |

Settings and open tickets are saved to the bot's persistent storage, so they survive restarts. One open ticket per member at a time.

Built and maintained by [FadeHost](https://fadehost.com). MIT licensed.
