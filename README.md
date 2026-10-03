# OpenGhost

**v1.3.0 beta**

[Windows version 1.3.0](https://github.com/ANDRETRIPOL/OpenGhost/releases/download/v1.3.0/OpenGhost-1.3.0-Setup.exe)

[Linux version 1.3.0](https://github.com/ANDRETRIPOL/OpenGhost/releases/download/v1.3.0/OpenGhost-1.3.0-linux.tar.gz)

[macOS version 1.3.0](https://github.com/ANDRETRIPOL/OpenGhost/releases/download/v1.3.0/OpenGhost-1.3.0-mac.dmg)

What's new:
- A rebuilt drawing engine. Charts and diagrams have a new, restrained look at the size of the chat's text, and the engine now knows 43 kinds of drawings: finance, sport, food and recipes, documents, languages, PC builds, device settings, trips, code and more. A reply carries several drawings, each made for its subject.
- Photos and videos in replies. The agent finds pictures and YouTube videos itself and shows them as a stack to leaf through and as cards with previews.
- Chats without a folder. Just start typing: the chat goes to Chats at the top of the list.
- Send videos. A video attaches like a photo, and the agent watches it frame by frame.
- Chat stats and Compact chat in the plus menu: what the chat has spent by reply and by model, how much of it came from the cache, and one click to free the context of a long chat.
- Mini chat keeps its conversation: it is saved with the chat it was opened over.
- PDFs are read: in attachments, in your files and by the agent.
- More stable and cheaper: the providers' cache works in every chat, a long chat is compacted by the window of its own model, and the model lists come from the providers themselves.
- A new splash, a new window backdrop and a calmer password screen for locked chats.

Older versions are on the [Releases](https://github.com/ANDRETRIPOL/OpenGhost/releases) page.

The code is under the MIT license. The name OpenGhost, the ghost logo, the animations, and the visual design are not. You may not use those for any commercial purpose. See LICENSE.

OpenGhost is an open desktop agent for Windows, macOS and Linux. It runs commands, edits files, keeps git and works on the web in a browser of its own. And it shows what it explains: charts, schemes, photos and videos stand next to the text.

## Written from scratch

Nothing in OpenGhost is assembled from ready parts. There is no UI framework inside, no Markdown library, no Mermaid, no chart library and no agent framework. Every part is our own code:

- **The agent.** The loop, the tools (commands, files, git, web search, pages, PDFs, video frames), the approval cards and the three permission modes.
- **The drawing engine.** It reads what a model writes, lays it out and draws it: 43 kinds of drawings, from flowcharts and loss curves to a day of meals and the route of a trip. A drawing is live: it answers the pointer and can be edited where it stands.
- **The browser.** The agent sees a page as text with numbered elements, moves its own cursor, clicks, types and reads, in a browser panel it shares with you.
- **The text.** The Markdown renderer that draws a reply while it is still being written, the code highlighter and the math.
- **The interface.** Every control, its motion and its glass, in plain JavaScript and CSS.

The app stands on two things only: Electron, which gives it a window, and Anthropic's official SDK, which talks to Claude.

## It shows what it explains

Ask how something works, and the answer comes with drawings: the whole as a scheme, the curves the topic is known for as charts, the key numbers as tiles. Here three training runs stand on one chart: a healthy one, one that blows up and one that barely moves.

![A chart of three training runs and tiles with the key numbers](images/visual.jpg)

## A scheme with the detail in it

A block carries its name and a line about what happens in it. Stages stand in groups, and a process that repeats closes into a ring.

![A scheme of how a model is trained, in three stages](images/scheme.jpg)

## Drawings made for the subject

Food, recipes, documents, matches, languages, PC builds, device settings and trips have drawings of their own. A day of meals is a ring of calories with protein, fat and carbs against the goal.

![A day of meals: calories, protein, fat and carbs against the goal](images/food.jpg)

A trip is a route with its legs, and words to learn come with their sound and an example.

![A route through Portugal and a list of words for a café](images/trip.jpg)

## Change the drawing where it stands

A drawing is not a finished picture. Open it and change the layout, the blocks and the arrows in a table, or edit its source. The drawing follows as you type.

![A flowchart with its editor open](images/editor.jpg)

## Photos and videos in the reply

When a thing is better seen than described, a dish, a place, a game, the agent looks for pictures and videos itself. Pictures stand in a stack to leaf through, each with the page it came from. A video is a card with its preview, name and length, and a click opens it in your browser.

## A browser with its own cursor

OpenGhost has a built-in browser and drives it itself. It opens a page, moves its own cursor, clicks, types, and sees what is on the screen. The panel sits on the right of the chat. Close it and the agent still works.

![Chat beside the built-in browser](images/browser.jpg)

## Start with a question, not with a folder

A new chat needs no folder. Type, and it goes to Chats at the top of the list, with a folder of its own for the files the agent makes. A chat about a project still lives in that project's folder.

![A new chat with the ghost above the composer](images/welcome.jpg)

## Mini chat for a side question

Select a passage and open Mini chat over the conversation. It is the same agent, with the current chat as context, and what you write there is kept with the chat.

![Mini chat over a conversation](images/mini.jpg)

## What a chat costs

Chat stats, in the plus menu, show what a chat has spent: the tokens of every reply, the share of each model, how much of it came from the cache and how full the context is. Compact chat, next to it, frees the context of a long conversation, and the app does the same by itself before the model's window fills.

![The chat stats card](images/stats.jpg)

## Show it a photo, a video, a PDF

Photos, videos and files attach from the plus menu or by a drop. A video comes in like a photo, and the agent watches it frame by frame. A PDF is read as text.

## Tell it once, for every chat

In Settings, under General, you write how to answer and what to know about you, and add the files OpenGhost should always have at hand: notes, a style guide, a CV. Every chat gets them, and a long chat keeps them after it is compacted.

![The General page of the settings: instructions and files kept for every chat](images/general.jpg)

## Three ways to let it act

Ask waits for approval before commands, file changes, and the web. Auto works inside the project folder and asks before a risky step. Full access does not ask.

![Ask, Auto, and Full access](images/modes.jpg)

## The key stays on this computer

OpenGhost works with ChatGPT, OpenAI, Claude, DeepSeek, and OpenCode Go: sign in with your ChatGPT account, or connect OpenAI, Claude, DeepSeek and OpenCode Go with an API key. Keys and sign-ins are stored only on your machine, encrypted by the operating system, and the list of models comes from each provider itself. Any chat can also be locked with a password: it is real encryption on your computer, not a lock screen.

![The Providers page of the settings: ChatGPT, OpenAI, Anthropic and DeepSeek](images/settings.jpg)

## It opens with the ghost

The app starts on its own screen. The ghost flies in through the mist, then the name OpenGhost appears.

![OpenGhost splash screen](images/splash.jpg)

## Build it yourself

The same code runs on Windows, macOS and Linux. You need Node.js 22 or newer.

```
npm ci
npm start
```

`npm start` runs the app straight from the code. To make an installer, run the command for your system on that system:

- Windows: `npm run dist` makes `dist/OpenGhost-<version>-Setup.exe`
- macOS: `npm run dist:mac` makes `dist/OpenGhost-<version>-mac.dmg`
- Linux: `npm run dist:linux` makes `dist/OpenGhost-<version>-linux.tar.gz`

No Mac or Linux machine at hand? A fork can build both on GitHub: turn on Actions, open Build and press Run workflow. The files appear on the page of that run.

## Thanks

[@kodachromez](https://github.com/kodachromez) found eight real bugs in a single report, and [@Bruno8R](https://github.com/Bruno8R) noticed that API keys were kept in plain text. All of it is fixed in v1.2.0. Thank you both.
