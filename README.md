**Visualize, explore and learn in a new way, with OpenGhost.**

![OpenGhost explaining AI training with diagrams in the chat](images/readme-visualization.png)

# OpenGhost

[![Discord](https://img.shields.io/badge/Discord-join%20the%20server-5865F2?logo=discord&logoColor=white)](https://discord.gg/6cKd2UND5) [![Website](https://img.shields.io/badge/Website-try%20it%20in%20your%20browser-171717)](https://andretripol.github.io/OpenGhost/)

**v1.5.2 beta**

[Windows version 1.5.2](https://github.com/ANDRETRIPOL/OpenGhost/releases/download/v1.5.2/OpenGhost-1.5.2-Setup.exe)

[Linux version 1.5.2](https://github.com/ANDRETRIPOL/OpenGhost/releases/download/v1.5.2/OpenGhost-1.5.2-linux.tar.gz)

[macOS version 1.5.2](https://github.com/ANDRETRIPOL/OpenGhost/releases/download/v1.5.2/OpenGhost-1.5.2-mac.dmg)

What's new:
- Save browser screenshots as PNG files and attach local files on websites, without extra approval prompts in Full access.
- Remember ASK approvals for a type of action in the current chat, and reset them from its menu.
- Each chat keeps its own reasoning effort.
- Continue from completed work after a temporary disconnect, with better recovery after failed compaction and clearer permanent API errors.
- End a running task from the composer, preview photos before sending, and see finished charts between tool calls. Browser tabs, plan and password panels are smoother too.

Older versions are on the [Releases](https://github.com/ANDRETRIPOL/OpenGhost/releases) page.

Try the app in your browser, with no install, on [the website](https://andretripol.github.io/OpenGhost/).

OpenGhost is an open desktop agent for Windows, macOS and Linux. It runs commands, edits files, keeps git and works on the web in a browser of its own. And it shows what it explains: charts, schemes, photos and videos stand next to the text.

## An agent built for visualization

OpenGhost is an agent built for visualization. When something is better shown than told, the answer comes with a drawing beside it, and the whole app is made so that reading and working with documents feels comfortable. A new chat needs no folder: type, and it goes to Chats at the top of the list, with a folder of its own for the files the agent makes. A chat about a project still lives in that project's folder.

## Written from scratch

Nothing in OpenGhost is assembled from ready parts. There is no UI framework inside, no Markdown library, no Mermaid, no chart library and no agent framework. Every part is our own code:

- **The agent.** The loop, the tools (commands, files, git, web search, pages, PDFs, video frames), the approval cards and the three permission modes.
- **The drawing engine.** It reads what a model writes, lays it out and draws it: 43 kinds of drawings, from flowcharts and loss curves to a day of meals and the route of a trip. A drawing is live: it answers the pointer and can be edited where it stands.
- **The browser.** The agent sees a page as text with numbered elements, moves its own cursor, clicks, types and reads, in a browser panel it shares with you.
- **The text.** The Markdown renderer that draws a reply while it is still being written, the code highlighter and the math.
- **The interface.** Every control, its motion and its glass, in plain JavaScript and CSS.

The app stands on two things only: Electron, which gives it a window, and Anthropic's official SDK, which talks to Claude.

## It shows what it explains

Ask how something works, and the answer comes with drawings: the whole as a scheme, the curves the topic is known for as charts, the key numbers as tiles. The engine knows more than forty kinds of drawings, from a day of meals and the route of a trip to the charts of physics and other sciences. In the picture at the top, a training process is explained as a sequence and a cycle.

## A scheme with the detail in it

A block carries its name and a line about what happens in it. Stages stand in groups, and a process that repeats closes into a ring.

## Drawings made for the subject

Food, recipes, documents, matches, languages, PC builds, device settings and trips have drawings of their own. A day of meals is a ring of calories with protein, fat and carbs against the goal.

A trip is a route with its legs, and words to learn come with their sound and an example.

## Change the drawing where it stands

A drawing is not a finished picture. Open it and change the layout, the blocks and the arrows in a table, or edit its source. The drawing follows as you type.

## Photos and videos in the reply

When a thing is better seen than described, a dish, a place, a game, the agent looks for pictures and videos itself. Pictures stand in a stack to leaf through, each with the page it came from. A video is a card with its preview, name and length, and a click opens it in your browser.

## A plan that checks the work

Give the agent a goal with several parts and it makes a plan on its own. The steps stay at the top of the chat as it works, and each finished step says what showed it was done. The agent cannot finish while steps are still open.

Before a step closes, OpenGhost checks the work it can see: tests, builds or linters after code changes; documents read back and checked against the request; pages at phone and desktop sizes; and sources and quotations in research. If a check fails, the step stays open. When a step can only be accepted on the agent's word, a hollow tick makes that clear. These checks make it harder to claim work was done without evidence, though they cannot guarantee every result is right.

![The agent's plan, with completed, current and remaining steps](images/readme-plan.png)

## A browser with its own cursor

OpenGhost has a built-in browser and drives it itself. It opens a page, moves its own cursor, clicks, types, and sees what is on the screen. The panel sits on the right of the chat. Close it and the agent still works.

## It works in your accounts

The browser panel is signed in where you are, so the agent works inside your own accounts and not only on open pages. A custom MCP server of ours gives it the control it needs over the sites it drives. One request can cover a whole round: open my Reddit account, tell me the view counts of my three most recent posts, then go through the comments and pull out the ones that matter, both the suggestions and the bugs people ran into.

![The agent reviewing Reddit comments in its browser while a daily routine is shown in the chat](images/readme-browser.png)

## Routines, without having to name them

Say "check this every morning", "remind me at 19:00" or "tell me when the price drops", and the agent understands that the task needs a routine and sets one up. A routine can run once or repeat, do the work while you are away, and tell you what it found. OpenGhost keeps running in the tray when its window is closed, so routines can run then too. They run while the app is running.

## Notes it keeps an eye on

For something to return to at a moment in your work together, say "when the design is done, remind me about the tests". The agent puts it in the notepad beside the chat and keeps it in mind. When that moment arrives, it brings the note up by itself and asks whether to deal with it now. It does not act on a note without your say. Notes wait for a moment in the conversation; timed, repeated or background tasks are routines.

## Memory for long work

OpenGhost combines several kinds of memory. Each chat has a private, dated record of its own: decisions, discoveries, preferences for the task and details worth keeping. A separate shared memory holds what matters across chats, such as who you are and how you like answers. The agent keeps these records as you work, and you can read, edit or switch off the shared memory in Settings. A project can have instructions of its own in an AGENTS.md file.

As a chat grows, OpenGhost compacts the conversation into a rolling summary while keeping the latest exchanges and the chat's private record. It builds on the previous summary instead of processing the entire chat again. Together, these layers are designed for work that continues for months without having to carry the whole conversation in the model's context. Important facts can still be missed, so check critical details.

## Skills

OpenGhost understands the open Agent Skills format. Send a link to a skill and add it after reviewing the card; the agent can then choose it when the work calls for it, or you can pick it yourself with /name. Skills are available from the sidebar and can be used across chats.

![A skill installation card, with its source, contents and an Add skill button](images/readme-skills.png)

## Find or fork a chat

The magnifier, or Ctrl+K, opens a search in the middle of the chat. Type, and the chats it finds come out under it, each under its folder.

![Chat search showing recent conversations grouped by folder](images/readme-search.png)

To explore another direction, fork a conversation from any message or from its menu. The new chat continues from that point without changing the original; its notes, mini chat, folder and password come along.

## Quick chat, from anywhere

Press Alt+Space, or the combination you set in Settings, and a small chat comes up over whatever is on screen: first its message field, then the rest. It is a full agent, called from anywhere: ask, read the answer, press Esc. It picks its own model and effort, searches the web, and keeps its chats in the list with a bolt; the arrows in its head open the chat in the app. Give its agent a task and close it, and the agent goes on with the app out of the way: the chat is marked when the answer is there, and you never had to open OpenGhost. With nothing to do, a closed quick chat sleeps.

![Quick chat over the desktop](images/quick.jpg)

## Mini chat, with an agent of its own

Open Mini chat over the conversation and ask the second question you have in mind. It floats: drag it by its head, pull the arc in its corner to resize it, and keep writing in the chat behind it. The agent inside is a full agent that sees the history of the main chat, and it works in parallel with the agent of the chat, in its own browser tab: the two coordinate and never get in each other's way, they only add to each other. Close a mini chat at work and its agent goes on by itself and finishes the task.

![Mini chat over a conversation, the browser beside it](images/mini.jpg)

## What a chat costs

Chat stats, in the plus menu, show what a chat has spent: the tokens of every reply, the share of each model, how much of it came from the cache and how full the context is. Compact chat, next to it, frees the context of a long conversation, and the app does the same by itself before the model's window fills.

## Show it a photo, a video, a PDF

Photos, videos and files attach from the plus menu or by a drop. A video comes in like a photo, and the agent watches it frame by frame. A PDF is read as text, and its pages with photos, charts, formulas or scans are looked at as pictures.

## Tell it once, for every chat

The app itself speaks English, Italian, French and Russian, and you choose the language in Settings, under General. There too you write how to answer and what to know about you, and add the files OpenGhost should always have at hand: notes, a style guide, a CV. Every chat gets them, and a long chat keeps them after it is compacted.

The memory is the other side of the same page: everything OpenGhost has remembered about you is there to read and to change, to add to or to remove, or to switch off.

![General settings with the language menu, instructions and files for every chat](images/readme-general.png)

## A composer that helps you write

If you turn on next-message prediction, OpenGhost suggests a follow-up after a reply. Press Tab or the right arrow to put it in the message field, where you can change it before sending. Nothing is sent by itself. You can turn the feature off in Settings.

![Composer settings for predicting the next message](images/readme-composer.png)

## Make it yours

Light, dark, or the system's theme; the size of the interface; and, new in 1.4.5, the colour of your own messages and of the chat's background, each theme keeping its own. Nothing is picked for you: until you choose, the themes look as they always did.

![Appearance settings with light, dark and system themes, message colours and chat backgrounds](images/readme-appearance.png)

## Three ways to let it act

Ask waits for approval before commands, file changes, and the web. Auto works inside the project folder and asks before a risky step. Full access does not ask.

## Pick your model

Choose from the models available through your connected providers. You can also connect a local model server such as Ollama, LM Studio or llama.cpp, or an OpenAI-compatible API. The models shown depend on what your provider or server offers.

![The model picker, showing the selected model and alternatives](images/readme-models.png)

## The key stays on this computer

OpenGhost works with ChatGPT, OpenAI, Claude, DeepSeek and OpenRouter: sign in with your ChatGPT account, or connect OpenAI, Claude, DeepSeek and OpenRouter with an API key. Keys and sign-ins are stored only on your machine, encrypted by the operating system, and the list of models comes from each provider itself. Any chat can also be locked with a password: it is real encryption on your computer, not a lock screen.

## It opens with the ghost

The app starts on its own screen. The ghost flies in through the mist, then the name OpenGhost appears.

## Build it yourself

The same code runs on Windows, macOS and Linux. You need Node.js 22 or newer.

```
npm ci
npm start
```

`npm start` runs the app straight from the code. To make an installer, run the command for your system on that system:

- Windows: `npm run dist` makes `dist/OpenGhost-<version>-Setup.exe`
- macOS: `npm run dist:mac` makes `dist/OpenGhost-<version>-mac.dmg`
- Linux: `npm run dist:linux` makes `dist/OpenGhost-<version>-linux.tar.gz`, `OpenGhost-<version>-linux.AppImage`, and `OpenGhost-<version>-linux.deb` (or `npm run dist:deb` / `npm run dist:appimage`)

No Mac or Linux machine at hand? A fork can build both on GitHub: turn on Actions, open Build and press Run workflow. The files appear on the page of that run.

## Support the project

OpenGhost is free. Testing it on real models costs money for every release, and sponsorship pays for exactly that: API time and the work on new versions. If the app is useful to you, you can [sponsor it on GitHub](https://github.com/sponsors/ANDRETRIPOL).

## Thanks

[@kodachromez](https://github.com/kodachromez) found eight real bugs in a single report, and [@Bruno8R](https://github.com/Bruno8R) noticed that API keys were kept in plain text. All of it is fixed in v1.2.0. @kodachromez then went through 1.3.0 and found where the browser could not be stopped and where a tab hung: fixed in v1.4.0. Thank you both.

Thanks also to everyone who sent a pull request, taken or not: [@mike13kohler](https://github.com/mike13kohler), [@OussemaHarrabi](https://github.com/OussemaHarrabi), [@anupamme](https://github.com/anupamme), [@onlinegill](https://github.com/onlinegill), [@abdulwalidal](https://github.com/abdulwalidal) and [@lohrynn](https://github.com/lohrynn), who also found where the quick chat's shadow was cut off by the edge of its window and where glass maps were drawn for buttons that no longer use them. Reading someone else's code and writing up what is wrong in it takes time, and it is what moves this app forward.

## Building on OpenGhost

If you are working on a project that is related to OpenGhost and uses "openghost" as part of its name, for example "openghost-dashboard" or "openghost-mobile", please add a note to your README to clarify that it is not built by the OpenGhost author and is not affiliated with him in any way.
