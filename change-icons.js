(() => {
'use strict';

// The signs of the kinds of change a version brings, for "What's new" (whats-new.js) and wherever a change is named
// again. One family: drawn on a 24 grid in the system's light line, round ends, nothing filled but a dot. A change is
// given the sign of what it touches, not of how big it is.
const sign = body => `<svg class="change-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
 // The agent's memory: what it keeps of a chat, its summaries, its record.
 memory: sign('<path d="M12 4 20 8l-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>'),
 // What a model sees: pictures, files read as pictures.
 vision: sign('<path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z"/><circle cx="12" cy="12" r="2.75"/>'),
 // Faster: an answer sooner, less waiting.
 speed: sign('<path d="M13.25 3 5.5 13.25h6.25L10.75 21l7.75-10.25h-6.25z"/>'),
 // Something that went wrong works now.
 fix: sign('<path d="M14.6 4.2a4.6 4.6 0 0 0-4.1 6.3l-6 6a1.9 1.9 0 0 0 2.7 2.7l6-6a4.6 4.6 0 0 0 6.3-4.1l-2.6 2.1-2.5-.6-.6-2.5z"/>'),
 // Models and providers: which are offered, how they are spoken to.
 model: sign('<rect x="6.75" y="6.75" width="10.5" height="10.5" rx="2.25"/><path d="M10 3.25v3.5M14 3.25v3.5M10 17.25v3.5M14 17.25v3.5M3.25 10h3.5M3.25 14h3.5M17.25 10h3.5M17.25 14h3.5"/>'),
 // Models on the user's own computer.
 local: sign('<rect x="4.75" y="5.25" width="14.5" height="10" rx="1.75"/><path d="M2.75 18.75h18.5"/>'),
 // How the app looks and moves.
 look: sign('<path d="M11 3.5c.55 4.05 2.2 5.7 6.25 6.25-4.05.55-5.7 2.2-6.25 6.25-.55-4.05-2.2-5.7-6.25-6.25C8.8 9.2 10.45 7.55 11 3.5z"/><path d="M18 14.5c.25 1.55.95 2.25 2.5 2.5-1.55.25-2.25.95-2.5 2.5-.25-1.55-.95-2.25-2.5-2.5 1.55-.25 2.25-.95 2.5-2.5z"/>'),
 // What is counted and shown in figures.
 stats: sign('<path d="M5.75 19.25v-6.5M12 19.25V4.75M18.25 19.25v-9.5"/>'),
 // What the agent may do, and what stays the user's.
 safety: sign('<path d="M12 3.25 18.75 6v5.25c0 4.3-2.85 7.75-6.75 9.25-3.9-1.5-6.75-4.95-6.75-9.25V6z"/><path d="m9.25 12 2 2 3.5-3.75"/>'),
 // Languages of the app.
 language: sign('<circle cx="12" cy="12" r="8.75"/><path d="M3.25 12h17.5M12 3.25c2.35 2.45 3.5 5.35 3.5 8.75s-1.15 6.3-3.5 8.75c-2.35-2.45-3.5-5.35-3.5-8.75S9.65 5.7 12 3.25z"/>'),
 // Files and folders the agent works in.
 files: sign('<path d="M13.75 3.25h-6a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2h8.5a2 2 0 0 0 2-2V7.75z"/><path d="M13.75 3.25v4.5h4.5"/>'),
 // Drawings in answers.
 drawing: sign('<path d="M4 19.75h16"/><path d="m5.25 15.25 4-4.5 3.5 3 5.75-6.75"/><circle cx="18.5" cy="7" r=".9" fill="currentColor" stroke="none"/>'),
 // What the agent itself does: its work, its steps.
 agent: sign('<path d="M6.25 19.75V11a5.75 5.75 0 0 1 11.5 0v8.75l-1.9-1.4-1.9 1.4-2-1.4-1.9 1.4-1.9-1.4z"/><circle cx="10" cy="11.25" r=".95" fill="currentColor" stroke="none"/><circle cx="14" cy="11.25" r=".95" fill="currentColor" stroke="none"/>'),
 // What a chat costs, in tokens or money.
 cost: sign('<path d="M16.25 4.6A8.5 8.5 0 1 0 20.5 12"/><circle cx="17.75" cy="8.25" r="2" fill="currentColor" stroke="none"/>'),
};

window.ChangeIcons = { ...ICONS, of: name => ICONS[name] || ICONS.fix, names: Object.keys(ICONS) };
})();
