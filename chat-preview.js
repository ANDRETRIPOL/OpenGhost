(() => {
'use strict';

// What a chat's row in the sidebar shows of the chat (chat-list.js): the start of its last message, the user's or the
// reply's, as one line of plain words, and its latest picture, small. Kept in the chats' index (chat.preview), so the
// list shows them without reading the chats. A protected chat shows neither: the index is not sealed.
const PREVIEW = { text: 140, thumb: 112, quality: 0.78 };
// The pictures a reply shows: the agent's own, kept with the chat, and those of the places that load by themselves.
const PICTURE = /!\[[^\]]*\]\(\s*<?((?:ogpic:\/\/chat\/|https:\/\/)[^\s<>()]+)>?(?:\s+"[^"]*")?\s*\)/g;

// One line of plain words from Markdown: no fences, drawings, pictures, links' addresses or marks. Headings and tables
// are left out when there are words besides them: a reply that opens with a heading and a table says itself in the
// sentence after them.
function plain(text) {
 const flat = String(text || '')
  .replace(/```[\s\S]*?(```|$)/g, '\n')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
  .replace(/`([^`\n]+)`/g, '$1')
  .replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, '$1$2')
  .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, '$1$2');
 const line = lines => lines.map(text => text.replace(/^\s{0,3}(>|[-*+]|\d+[.)])\s+/, '')).join(' ').replace(/\|/g, ' ').replace(/\*\*|~~|`+/g, '').replace(/\s+/g, ' ').trim();
 const all = flat.split('\n'), prose = all.filter(text => !/^\s{0,3}#{1,6}\s/.test(text) && !text.includes('|'));
 return (line(prose) || line(all.map(text => text.replace(/^\s{0,3}#{1,6}\s+/, '')))).slice(0, PREVIEW.text);
}

// The pictures of a message, in their order: the user's photos and the frames of their videos, or a reply's pictures.
function pictures(entry, promptOf) {
 if (entry.role === 'user') return promptOf(entry).attachments.filter(item => (item.image || item.video) && item.url).map(item => item.url);
 if (entry.role !== 'assistant' || typeof entry.content !== 'string') return [];
 return [...entry.content.matchAll(PICTURE)].map(m => m[1]).filter(url => !/^https:/i.test(url) || window.MediaEmbed?.trusted(url));
}

// The last message's words, and the latest picture of the chat.
function of(messages, promptOf) {
 let text = '', mine = false, photo = '';
 for (let k = messages.length - 1; k >= 0 && (!text || !photo); k--) {
  const entry = messages[k];
  if (entry.role !== 'user' && entry.role !== 'assistant') continue;
  if (!text) {
   const words = entry.role === 'user' ? plain(entry.text ?? (typeof entry.content === 'string' ? entry.content : '')) : plain(typeof entry.content === 'string' ? entry.content : '');
   if (words) { text = words; mine = entry.role === 'user'; }
  }
  if (!photo) photo = pictures(entry, promptOf).at(-1) || '';
 }
 return { text, mine, photo };
}

// A picture made small and square, as the row shows it: the user's photos are large, and the index holds this one.
// The pictures of a reply are drawn from where they are, as they are.
function thumb(src) {
 if (!/^data:/i.test(src)) return Promise.resolve(src);
 return new Promise(resolve => {
  const img = new Image();
  img.onload = () => {
   const side = PREVIEW.thumb, canvas = document.createElement('canvas'), k = side / Math.min(img.naturalWidth, img.naturalHeight);
   canvas.width = canvas.height = side;
   const w = img.naturalWidth * k, h = img.naturalHeight * k;
   canvas.getContext('2d').drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
   resolve(canvas.toDataURL('image/jpeg', PREVIEW.quality));
  };
  img.onerror = () => resolve('');
  img.src = src;
 });
}

window.ChatPreview = { of, thumb, plain };
})();
