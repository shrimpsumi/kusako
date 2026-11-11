<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/shrimpsumi/assets@main/kusakobaner-noshrimp-noshadow.png" width="680" alt="kusako" />
</p>

<p align="center">a discord bot for economy, levels, items, and custom autoresponder replies.</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/invite%20her-soon-c9b8ec?style=flat&labelColor=8f79c9" alt="invite her" /></a>
  <a href="https://discord.gg/ytsuErErG5"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FytsuErErG5%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=support%20server&labelColor=8f79c9&color=c9b8ec" alt="support server" /></a>
  <a href="#"><img src="https://img.shields.io/badge/docs-soon-c9b8ec?style=flat&labelColor=8f79c9" alt="docs" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/shrimpsumi/kusako?style=flat&labelColor=8f79c9&color=c9b8ec" alt="license" /></a>
</p>

kusako is a mega chunky discord bot built for community servers! she's got autoresponders, welcome messages, leveling, tickets, and a lot more. sako's written entirely in typescript on [discord.js](https://discord.js.org/) and keeps everything in one sqlite file!

## main features

- **autoresponders**: replies to trigger words, with cooldowns, requirements, and randomness
- **economy**: server currencies, custom items, inventories, gifting, and shops!
- **leveling**: XP for chatting, with an optional reply and role for each level
- **events**: replies for joins, leaves, boosts, and birthdays
- **tickets**: a panel of buttons that opens private channels for your staff and users
- **role menus**: pick-your-own-role dropdowns or buttons
- **embeds**: super awesome embed builder or optional JSON-paste support
- **scheduled messages**: daily, weekly, every so often, or once!
- **stickies**: customizable messages/embeds that stick to bottom of channels

## autoresponders: variable placeholder and functions

autoresponder replies can make use of numerous placeholders; there are four types of variables:

- placeholder variables such as `{user}`, `{server.membercount}`, or `{user.balance}`
- generator functions which create some sort of data: `{range as prize: 30-60}`, then `[prize]` anywhere after
- guard variables which can gate some autoresponder, example: `{requirebal:100}`, `{requirerole:admin}`, `{cooldown:3600}`
- functions can update users: `{modifybal:-100}`, `{addrole:verified}`, `{temprole:muted|600}`

<details>
<summary>some autoresponder examples from sako's server!</summary>

timed autoresponder reminder for a discord bot minigame. adds a reaction to the triggering message; then, 8 minutes later, sends the reply ("{user}, your drop is off cooldown !!"):

```
{user.nickname as guy}{react:<a:15:1452348277591900343>}{cooldown:480}{delay:480}{user}, your drop is off cooldown !! {error:you're still on cooldown... please wait a bit [guy]~ <:catRose:1338734225993633843> }
```

a boost event that sends an embed and gives the booster 5,000 currency:

```
{modifybal:5000}{embed:boosted}
```

a `.crime` autoresponder. one hour cooldown, a random crime, and either a jackpot, a regular payout, or nothing:

```
{server.currencyemoji as c}{cooldown:3600}{error: can't commit another crime yet! wait for [cooldown.remaining]}{range as jackpot: 400-550}{range as gain: 50-200}{choice as crime: fed kusako beyond salmon instead of a real fish | called kusako a giga dent | gifted sako a chicken biryani scented candle | mega lowballed a sofi bot card }{weightedchoice as roll: 10 big | 40 win | 50 caught}{lockedchoice as del: roll | [jackpot] | [gain] | 0}{lockedchoice as outcome: roll | somehow made bank off it,,, [c] **[jackpot]** | got away with it,, [c] **[gain]** | got caught instantly,,, nothing for you}{modifybal:[del]}you [crime] and [outcome]
```

</details>

> [!NOTE]
> check out sako's **[cardboard atelier](https://discord.gg/ytsuErErG5)**, an art, social, and her support hub server! it uses her features pretty much everywhere, so come look around for inspiration or get help!

## permissions

kusako needs at the very least **view channels**, **send messages**, **embed links**, **attach files**, and **read message history**. the rest depend on what you use, but are generally recommended:

- **add reactions**: `{react}` and `{reactreply}`
- **use external emojis**: custom emoji in replies, buttons, and dropdowns
- **manage messages**: `{deletetrigger}` and `{delete_reply}`
- **manage roles**: role tags, role menus, and level roles
- **manage nicknames**: `{setnick}`
- **manage channels**: tickets
- **mention everyone**: optional, lets her ping roles that aren't mentionable. @everyone and @here pings are disabled for sako!

> [!IMPORTANT]
> **make sure sako's role is ABOVE any role you want her to give out** in your server's role list! if her role is below it, she can't add it, and this is the most common reason roles don't work !

## self hosting

1. make an application in the [discord developer portal](https://discord.com/developers/applications), add a bot, and turn on the **server members** and **message content** intents
2. invite her with the **bot** and **applications.commands** scopes from the OAuth2 URL generator
3. `pnpm i`, then copy `.env.example` as `.env` and fill it in

## thank you to

- [mimu](https://mimu.bot/): kusako's autoresponder and economy were heavily inspired by mimu! if you're looking for an even more adorable and powerful bot for your community, you should totally check [iara's](https://x.com/iaramallows) bot out at https://mimu.bot/ !
- [Glitchii](https://github.com/Glitchii): for the incredible [embed builder](https://glitchii.github.io/embedbuilder/) i used NUMEROUS times throughout building this project and others.
- [SOFI](https://sofi.gg/): an anime card collecting bot whose drop timers are why `{delay}`, `{cooldown}`, and a few other DSL features exist !
